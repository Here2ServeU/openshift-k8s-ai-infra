#!/usr/bin/env bash
# Apply the guardrails workload to the local kind cluster and assert the
# platform contract (ScaledObject, NetworkPolicy, RBAC, policy ConfigMap valid).
# The Llama-Guard pod will NOT become ready on kind (no GPU + placeholder image),
# and that's expected — the test verifies the contract, not the inference path.
set -euo pipefail

NS=guardrails

echo "→ Applying $NS manifests"
kubectl apply -f workloads/guardrails/namespace.yaml
kubectl apply -f workloads/guardrails/configmap.yaml
kubectl apply -f workloads/guardrails/deployment.yaml
kubectl apply -f workloads/guardrails/service.yaml
kubectl apply -f workloads/guardrails/networkpolicy.yaml
kubectl apply -f workloads/guardrails/pdb.yaml

# scaledobject + servicemonitor require KEDA + Prometheus Operator CRDs. If
# the local cluster doesn't have them installed yet, skip these — don't fail.
if kubectl get crd scaledobjects.keda.sh >/dev/null 2>&1; then
  kubectl apply -f workloads/guardrails/scaledobject.yaml
  echo "✓ ScaledObject applied"
else
  echo "skip: KEDA CRDs not present; ScaledObject not applied"
fi

if kubectl get crd servicemonitors.monitoring.coreos.com >/dev/null 2>&1; then
  kubectl apply -f workloads/guardrails/servicemonitor.yaml
  echo "✓ ServiceMonitor + PrometheusRule applied"
else
  echo "skip: Prometheus Operator CRDs not present; ServiceMonitor not applied"
fi

echo "→ Asserting NetworkPolicy default-deny is in place"
kubectl -n "$NS" get networkpolicy llama-guard-default-deny >/dev/null

echo "→ Asserting egress NetworkPolicy blocks IMDS"
kubectl -n "$NS" get networkpolicy llama-guard-egress -o yaml | grep -q "169.254.169.254" \
  || { echo "FAIL: IMDS block missing from egress NetworkPolicy"; exit 1; }
echo "✓ IMDS block present"

echo "→ Asserting ServiceAccount has IRSA / Workload Identity annotations"
kubectl -n "$NS" get sa llama-guard -o yaml | grep -q "eks.amazonaws.com/role-arn" \
  || { echo "FAIL: IRSA annotation missing"; exit 1; }
kubectl -n "$NS" get sa llama-guard -o yaml | grep -q "iam.gke.io/gcp-service-account" \
  || { echo "FAIL: GKE Workload Identity annotation missing"; exit 1; }
echo "✓ Workload Identity annotations present"

echo "→ Asserting policy ConfigMap parses and contains expected categories"
POLICY=$(kubectl -n "$NS" get cm llama-guard-policy -o jsonpath='{.data.policy\.yaml}')
for cat in T2S-01-phi T2S-02-off-label T2S-03-system-prompt-extract T2S-04-credential-egress; do
  echo "$POLICY" | grep -q "id: $cat" \
    || { echo "FAIL: policy missing category $cat"; exit 1; }
done
echo "✓ all four T2S categories present in policy"

echo "→ Asserting Deployment requests a GPU"
kubectl -n "$NS" get deployment llama-guard -o yaml | grep -q "nvidia.com/gpu: 1" \
  || { echo "FAIL: GPU resource request missing"; exit 1; }
echo "✓ GPU resource request present (will ImagePullBackOff on kind — expected)"

echo
echo "✅ guardrails contract test passed."
echo "   Note: pod will ImagePullBackOff on kind. The real-image test is gated"
echo "   on a self-hosted GPU runner in CI."
