{{- define "llm-serving.name" -}}
vllm-{{ .Values.model.name }}
{{- end -}}

{{- define "llm-serving.labels" -}}
app.kubernetes.io/name: vllm
app.kubernetes.io/instance: {{ include "llm-serving.name" . }}
app.kubernetes.io/component: llm-serving
app.kubernetes.io/managed-by: helm
app: {{ include "llm-serving.name" . }}
model: {{ .Values.model.name }}
cloud: {{ .Values.cloud.provider }}
{{- end -}}

{{- define "llm-serving.selectorLabels" -}}
app: {{ include "llm-serving.name" . }}
model: {{ .Values.model.name }}
{{- end -}}

{{- define "llm-serving.modelDigestShort" -}}
{{ trimPrefix "sha256:" .Values.model.digest | trunc 12 }}
{{- end -}}
