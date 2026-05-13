# k8s-ai-ml-infra — top-level Makefile
# Run `make help` for the canonical list of targets.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

CLUSTER_NAME ?= ai-ml-infra
KIND_CONFIG  := local/kind/kind-config.yaml
NAMESPACE_PLATFORM := platform
NAMESPACE_OBS      := observability
NAMESPACE_WORKLOAD := workloads

# Set GPU=1 to use the CUDA build of vLLM. Default is CPU (TinyLlama).
GPU ?= 0

##@ Help

.PHONY: help
help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Local cluster

.PHONY: local-up
local-up: kind-up platform-up workloads-up ## Provision kind cluster + platform + workloads.
	@echo "Local stack is up. Try: make demo"

.PHONY: kind-up
kind-up: ## Create the local kind cluster.
	kind create cluster --name $(CLUSTER_NAME) --config $(KIND_CONFIG) || true
	kubectl cluster-info --context kind-$(CLUSTER_NAME)
	kubectl create namespace $(NAMESPACE_PLATFORM) --dry-run=client -o yaml | kubectl apply -f -
	kubectl create namespace $(NAMESPACE_OBS) --dry-run=client -o yaml | kubectl apply -f -
	kubectl create namespace $(NAMESPACE_WORKLOAD) --dry-run=client -o yaml | kubectl apply -f -

.PHONY: kind-down
kind-down: ## Tear down the local kind cluster.
	kind delete cluster --name $(CLUSTER_NAME)

.PHONY: local-down
local-down: kind-down ## Alias for kind-down.

##@ Platform layer (cluster-scoped)

.PHONY: platform-up
platform-up: argocd-install ## Install ArgoCD; it bootstraps everything else via app-of-apps.
	kubectl apply -f platform/argocd/app-of-apps.yaml
	@echo "ArgoCD is syncing the platform. Watch with: kubectl argo app list -n argocd"
	@echo "UI: make argocd-ui   |   Default password: make argocd-password"

.PHONY: argocd-install
argocd-install: ## Install ArgoCD itself (the only thing not managed by ArgoCD).
	kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.12.3/manifests/install.yaml
	kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

.PHONY: argocd-ui
argocd-ui: ## Port-forward ArgoCD UI to https://localhost:8080
	@echo "Opening https://localhost:8080 (accept self-signed cert)"
	kubectl port-forward -n argocd svc/argocd-server 8080:443

.PHONY: argocd-password
argocd-password: ## Print the initial ArgoCD admin password.
	@kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo

##@ Workloads

.PHONY: workloads-up
workloads-up: ## Trigger ArgoCD sync for workload apps.
	kubectl -n argocd patch app workloads --type merge -p '{"operation":{"sync":{}}}' || true

##@ Demo & test

.PHONY: demo
demo: ## Port-forward the LLM gateway and send a sample chat completion.
	@bash scripts/demo.sh

.PHONY: load-test
load-test: ## Run a k6 burst load test against the LLM endpoint.
	@bash scripts/load-test.sh

.PHONY: dashboards
dashboards: ## Open Grafana with the LLM serving dashboard.
	@echo "Grafana → http://localhost:3000   (admin / prom-operator)"
	kubectl port-forward -n $(NAMESPACE_OBS) svc/kube-prometheus-stack-grafana 3000:80

##@ Cloud deploys

.PHONY: aws-up
aws-up: ## Apply the AWS Terraform (EKS + GPU node group + Karpenter).
	cd terraform/aws && terraform init && terraform apply

.PHONY: gcp-up
gcp-up: ## Apply the GCP Terraform (GKE + GPU node pool + Workload Identity).
	cd terraform/gcp && terraform init && terraform apply

.PHONY: azure-up
azure-up: ## Apply the Azure Terraform (AKS + GPU spot pool + Workload Identity).
	cd terraform/azure && terraform init && terraform apply

##@ Hygiene

.PHONY: lint
lint: helm-lint yaml-lint tf-fmt ## Run all linters.

.PHONY: helm-lint
helm-lint: ## helm lint every chart.
	@for d in $$(find workloads platform -name Chart.yaml -exec dirname {} \;); do \
		echo "→ $$d"; helm lint $$d || exit 1; \
	done

.PHONY: yaml-lint
yaml-lint: ## yamllint the manifests.
	@yamllint -c .yamllint.yaml platform workloads observability || true

.PHONY: tf-fmt
tf-fmt: ## terraform fmt -check.
	terraform -chdir=terraform/aws fmt -recursive -check
	terraform -chdir=terraform/gcp fmt -recursive -check
	terraform -chdir=terraform/azure fmt -recursive -check
