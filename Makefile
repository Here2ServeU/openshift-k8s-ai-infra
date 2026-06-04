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

##@ T2S operator UI

UI_DIR := workloads/t2s-platform/ui
UI_PORT ?= auto

.PHONY: ui-dev
ui-dev: ## Start the t2s-ui Next.js dev server. Set UI_PORT=3010 to pin; default picks the first free port among 3000/3010/3020.
	@cd $(UI_DIR) && \
	if [ ! -d node_modules ]; then echo "→ installing deps"; npm install --no-audit --no-fund; fi && \
	PORT=$$( \
	  if [ "$(UI_PORT)" != "auto" ]; then echo $(UI_PORT); \
	  else for p in 3000 3010 3020 3030; do \
	    if ! lsof -nP -iTCP:$$p -sTCP:LISTEN >/dev/null 2>&1; then echo $$p; break; fi; \
	  done; fi \
	) && \
	echo "→ t2s-ui on http://localhost:$$PORT" && \
	npx next dev -p $$PORT

.PHONY: ui-build
ui-build: ## Production build of the t2s-ui standalone server.
	cd $(UI_DIR) && npm install --no-audit --no-fund && npm run build

.PHONY: ui-docker
ui-docker: ## Build the t2s-ui container image (ghcr.io/T2S/t2s-ui:0.2.0).
	docker build -t ghcr.io/T2S/t2s-ui:0.2.0 $(UI_DIR)

.PHONY: ui-share
ui-share: ## Expose the local dev server on a public https URL via cloudflared.
	@command -v cloudflared >/dev/null || { echo "Install cloudflared: brew install cloudflared"; exit 1; }
	@PORT=$$(lsof -nP -iTCP -sTCP:LISTEN -c node | awk '/next-server|next dev/ {print $$9}' | sed 's/.*://' | head -1); \
	if [ -z "$$PORT" ]; then echo "No t2s-ui dev server running. Run: make ui-dev"; exit 1; fi; \
	echo "→ tunneling http://localhost:$$PORT"; \
	cloudflared tunnel --url http://localhost:$$PORT

##@ Local component tests

.PHONY: test-local
test-local: test-vector-db test-mlflow test-voice-agent test-guardrails test-redteam test-python ## Run every local component test in sequence.
	@echo "→ All local component tests passed."

.PHONY: test-vector-db
test-vector-db: ## Apply Qdrant, upsert + query a sample vector, tear down port-forward.
	@bash scripts/test-vector-db.sh

.PHONY: test-mlflow
test-mlflow: ## Spin up MLflow (SQLite backend) and log a sample run.
	@bash scripts/test-mlflow.sh

.PHONY: test-voice-agent
test-voice-agent: ## Apply voice-agent manifests, assert KEDA + NetworkPolicy + RBAC contract.
	@bash scripts/test-voice-agent.sh

.PHONY: test-guardrails
test-guardrails: ## Apply guardrails (Llama Guard) manifests; assert ScaledObject + NetworkPolicy + policy ConfigMap.
	@bash scripts/test-guardrails.sh

.PHONY: test-redteam
test-redteam: ## Apply Garak red-team manifests; assert WorkflowTemplate + CronWorkflow + AnalysisTemplate parse.
	@bash scripts/test-redteam.sh

.PHONY: test-python
test-python: ## Smoke every Python automation script (--help + SLO + GPU report + SQS via LocalStack).
	@bash scripts/test-python.sh

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

.PHONY: rosa-up
rosa-up: ## Apply the ROSA Terraform (OpenShift HCP + GPU machine pool + OIDC). Needs RHCS_TOKEN.
	cd terraform/rosa && terraform init && terraform apply

##@ OpenShift profile (requires `oc` logged in as cluster-admin)

# Wait for an OLM CSV to report Succeeded before applying its CRs.
define wait_csv
	@echo "→ waiting for CSV matching '$(1)' in $(2) to Succeed..."; \
	for i in $$(seq 1 60); do \
		oc get csv -n $(2) 2>/dev/null | grep -q "$(1).*Succeeded" && { echo "  ok"; break; }; \
		sleep 10; \
	done
endef

.PHONY: ocp-up
ocp-up: ocp-operators ocp-gpu ocp-ai platform-up workloads-up ocp-route ## Full OpenShift bring-up, in dependency order.
	@echo "OpenShift stack is up."

.PHONY: ocp-operators
ocp-operators: ## Install OperatorHub Subscriptions (NFD, GPU Operator, cert-manager, RHOAI).
	oc apply -f platform/openshift/operators/

.PHONY: ocp-gpu
ocp-gpu: ## Create NodeFeatureDiscovery + GPU ClusterPolicy + time-slicing (waits on operator CSVs).
	$(call wait_csv,nfd,openshift-nfd)
	$(call wait_csv,gpu-operator-certified,nvidia-gpu-operator)
	oc apply -f platform/openshift/gpu/clusterpolicy.yaml
	oc apply -f platform/openshift/gpu/time-slicing-configmap.yaml
	@echo "GPU stack applied. Check: oc get clusterpolicy gpu-cluster-policy -o jsonpath='{.status.state}'"

.PHONY: ocp-ai
ocp-ai: ## Create the Red Hat OpenShift AI DataScienceCluster (waits on the RHOAI CSV).
	$(call wait_csv,rhods-operator,redhat-ods-operator)
	oc apply -f platform/openshift/operators/03-openshift-ai.yaml

.PHONY: ocp-route
ocp-route: ## Expose the inference gateway via an OpenShift Route.
	oc apply -f platform/openshift/routes/

.PHONY: ocp-gitops
ocp-gitops: ## Hand the OpenShift platform layer to ArgoCD for day-2 reconciliation (run after ocp-operators).
	oc apply -f platform/openshift/application.yaml

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
	terraform -chdir=terraform/rosa fmt -recursive -check
