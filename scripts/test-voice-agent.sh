#!/usr/bin/env bash
# Apply the voice-agent manifests and assert the platform contract:
#   1. ScaledObject was created and KEDA generated the HPA
#   2. default-deny + IMDS-egress block NetworkPolicies are present
#   3. ServiceAccount has the IRSA / Workload Identity annotations
#
# The image (ghcr.io/T2S/t2s-worker-voice:0.1.0) is a placeholder, so we expect
# the pod to be in ImagePullBackOff — that's not a failure of the platform
# contract, which is what this test validates.
set -euo pipefail

NS=t2s-voice

echo "→ Applying voice-agent manifests"
kubectl apply -f workloads/voice-agent/namespace.yaml
kubectl apply -f workloads/voice-agent/personas-configmap.yaml
kubectl apply -f workloads/voice-agent/worker.yaml
kubectl apply -f workloads/voice-agent/scaledobject.yaml || \
  echo "  (note: KEDA may not be installed locally — skipping ScaledObject apply)"
kubectl apply -f workloads/voice-agent/networkpolicy.yaml
kubectl apply -f workloads/voice-agent/servicemonitor.yaml || \
  echo "  (note: Prometheus operator may not be installed locally — skipping)"

echo "→ 1. ServiceAccount annotations"
SA_ANN=$(kubectl -n "$NS" get sa t2s-worker-voice -o jsonpath='{.metadata.annotations}')
echo "  $SA_ANN"
echo "$SA_ANN" | grep -q 'eks.amazonaws.com/role-arn' || { echo "FAIL: IRSA annotation missing"; exit 2; }
echo "$SA_ANN" | grep -q 'iam.gke.io/gcp-service-account' || { echo "FAIL: WI annotation missing"; exit 2; }

echo "→ 2. NetworkPolicies present"
kubectl -n "$NS" get networkpolicy voice-default-deny >/dev/null \
  || { echo "FAIL: default-deny missing"; exit 2; }
kubectl -n "$NS" get networkpolicy voice-worker-egress -o yaml \
  | grep -q '169.254.169.254' \
  || { echo "FAIL: IMDS egress block missing"; exit 2; }

echo "→ 3. ScaledObject (if KEDA installed)"
if kubectl api-resources | grep -q scaledobjects.keda.sh; then
  kubectl -n "$NS" get scaledobject t2s-worker-voice >/dev/null \
    || { echo "FAIL: ScaledObject missing"; exit 2; }
  # KEDA generates an HPA named keda-hpa-<scaledobject>
  for _ in {1..30}; do
    kubectl -n "$NS" get hpa keda-hpa-t2s-worker-voice >/dev/null 2>&1 && break || sleep 2
  done
  kubectl -n "$NS" get hpa keda-hpa-t2s-worker-voice >/dev/null \
    || { echo "FAIL: KEDA-generated HPA missing"; exit 2; }
else
  echo "  (KEDA not installed; ScaledObject contract not asserted)"
fi

echo "→ 4. Pod will ImagePullBackOff (expected — image is a placeholder)"
kubectl -n "$NS" get pods -l app.kubernetes.io/name=t2s-worker-voice

echo "✓ voice-agent platform contract OK"
