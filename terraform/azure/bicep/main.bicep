// Bicep rendering of the Terraform Azure stack one directory up (ADR-011).
//
// Terraform is canonical (ADR-007); this file exists for Azure-native shops
// that review/extend Bicep faster than HCL, or that mandate first-party
// tooling. It covers the cluster + operations core (VNet, AKS, node pools,
// upgrade cadence, Log Analytics, App Insights, control-plane diagnostics);
// the model-artifact storage + workload-identity plumbing stays Terraform-only
// until an environment goes Bicep-primary. Same names, same shape — drift
// between this file and the Terraform module is a bug in this file.
//
// Deploy:
//   az group create -n ai-ml-infra-rg -l eastus
//   az deployment group create -g ai-ml-infra-rg -f main.bicep

@description('Base name for the cluster and derived resources.')
param clusterName string = 'ai-ml-infra'

param location string = resourceGroup().location
param kubernetesVersion string = '1.30'
param addressSpace string = '10.42.0.0/16'
param systemVmSize string = 'Standard_D4s_v5'
param gpuVmSize string = 'Standard_NC4as_T4_v3'

@description('Day of week for the auto-upgrade / node-OS maintenance windows.')
param maintenanceDay string = 'Sunday'

@minValue(30)
param logRetentionDays int = 30

var tags = {
  project: 'k8s-ai-ml-infra'
  'managed-by': 'bicep'
  environment: 'dev'
  'cost-center': 'platform'
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: '${clusterName}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [addressSpace] }
    subnets: [
      {
        name: '${clusterName}-subnet'
        properties: { addressPrefix: cidrSubnet(addressSpace, 20, 0) }
      }
    ]
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${clusterName}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: logRetentionDays
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${clusterName}-appinsights'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' = {
  name: clusterName
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    dnsPrefix: clusterName
    kubernetesVersion: kubernetesVersion
    oidcIssuerProfile: { enabled: true }
    securityProfile: {
      workloadIdentity: { enabled: true }
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        vmSize: systemVmSize
        count: 2
        minCount: 2
        maxCount: 5
        enableAutoScaling: true
        vnetSubnetID: vnet.properties.subnets[0].id
        nodeLabels: { 'workload-type': 'system' }
        nodeTaints: ['CriticalAddonsOnly=true:NoSchedule']
      }
      {
        name: 'gpu'
        mode: 'User'
        vmSize: gpuVmSize
        count: 0
        minCount: 0
        maxCount: 4
        enableAutoScaling: true
        scaleSetPriority: 'Spot'
        scaleSetEvictionPolicy: 'Delete'
        spotMaxPrice: -1
        vnetSubnetID: vnet.properties.subnets[0].id
        nodeLabels: {
          'workload-type': 'serving'
          'nvidia.com/gpu': 'true'
        }
        nodeTaints: [
          'nvidia.com/gpu=true:NoSchedule'
          'kubernetes.azure.com/scalesetpriority=spot:NoSchedule'
        ]
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPolicy: 'calico'
      loadBalancerSku: 'standard'
    }
    // Patching is a managed cadence (ADR-011): patch versions + node OS CVEs
    // auto-apply inside the maintenance windows below; minor upgrades are a
    // deliberate, human-run change.
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
      nodeOSUpgradeChannel: 'NodeImage'
    }
    addonProfiles: {
      omsagent: {
        enabled: true
        config: { logAnalyticsWorkspaceResourceID: logAnalytics.id }
      }
      azurepolicy: { enabled: true }
    }
  }
}

resource mwAutoUpgrade 'Microsoft.ContainerService/managedClusters/maintenanceConfigurations@2024-09-01' = {
  parent: aks
  name: 'aksManagedAutoUpgradeSchedule'
  properties: {
    maintenanceWindow: {
      schedule: { weekly: { intervalWeeks: 1, dayOfWeek: maintenanceDay } }
      durationHours: 4
      startTime: '02:00'
      utcOffset: '+00:00'
    }
  }
}

resource mwNodeOs 'Microsoft.ContainerService/managedClusters/maintenanceConfigurations@2024-09-01' = {
  parent: aks
  name: 'aksManagedNodeOSUpgradeSchedule'
  properties: {
    maintenanceWindow: {
      schedule: { weekly: { intervalWeeks: 1, dayOfWeek: maintenanceDay } }
      durationHours: 4
      startTime: '06:00'
      utcOffset: '+00:00'
    }
  }
}

// Control-plane logs are only reachable via diagnostic settings. See
// terraform/azure/monitoring.tf for the category rationale.
resource aksDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${clusterName}-control-plane'
  scope: aks
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      { category: 'kube-apiserver', enabled: true }
      { category: 'kube-audit-admin', enabled: true }
      { category: 'kube-controller-manager', enabled: true }
      { category: 'kube-scheduler', enabled: true }
      { category: 'cluster-autoscaler', enabled: true }
      { category: 'guard', enabled: true }
    ]
  }
}

output clusterOidcIssuer string = aks.properties.oidcIssuerProfile.issuerURL
output logAnalyticsWorkspaceId string = logAnalytics.id
output kubeconfigCommand string = 'az aks get-credentials --resource-group ${resourceGroup().name} --name ${aks.name}'
