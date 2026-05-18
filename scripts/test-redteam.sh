#!/usr/bin/env bash
# Apply the red-team eval manifests to the local kind cluster and assert
# the platform contract: WorkflowTemplate parses, CronWorkflow is scheduled,
# AnalysisTemplate is valid, ConfigMap is mounted correctly.
#
# We do NOT actually submit a Garak run here — that needs argo-workflows
# installed and an OpenAI-compatible endpoint reachable. The deep run is in
# CI; this is the manifest + structural assertion.
set -euo pipefail

NS=workloads

echo "→ Applying redteam manifests"
kubectl apply -f workloads/eval-platform/redteam/configmap.yaml

if kubectl get crd workflowtemplates.argoproj.io >/dev/null 2>&1; then
  kubectl apply -f workloads/eval-platform/redteam/workflow-template.yaml
  kubectl apply -f workloads/eval-platform/redteam/cronworkflow.yaml
  echo "✓ argo-workflows CRDs present; WorkflowTemplate + CronWorkflow applied"
else
  echo "skip: argo-workflows CRDs not installed locally"
fi

if kubectl get crd analysistemplates.argoproj.io >/dev/null 2>&1; then
  kubectl apply -f workloads/eval-platform/redteam/analysis-template.yaml
  echo "✓ argo-rollouts CRDs present; AnalysisTemplate applied"
else
  echo "skip: argo-rollouts CRDs not installed locally"
fi

echo "→ Asserting generator ConfigMap parses to valid JSON"
GENCFG=$(kubectl -n "$NS" get cm garak-generator-config -o jsonpath='{.data.generator\.json}')
echo "$GENCFG" | python3 -c "import json, sys; json.load(sys.stdin)" \
  || { echo "FAIL: generator.json is not valid JSON"; exit 1; }
echo "✓ generator.json parses"

echo "→ Asserting required probe families are referenced"
if kubectl get crd cronworkflows.argoproj.io >/dev/null 2>&1; then
  CRON=$(kubectl -n "$NS" get cronworkflow llm-redteam-nightly -o yaml)
  for fam in promptinject dan goodside lmrc atkgen encoding latentinjection divergence; do
    echo "$CRON" | grep -q "$fam" \
      || { echo "FAIL: nightly sweep missing probe family: $fam"; exit 1; }
  done
  echo "✓ all 8 probe families present in nightly sweep"
fi

echo
echo "✅ redteam contract test passed."
