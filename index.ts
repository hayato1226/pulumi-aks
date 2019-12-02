import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import * as azuread from "@pulumi/azuread";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";

const config = new pulumi.Config();
export const password = config.require("password");
export const location = config.get("location") || "East US";
export const failoverLocation = config.get("failoverLocation") || "East US 2";
export const nodeCount = config.getNumber("nodeCount") || 2;
export const nodeSize = config.get("nodeSize") || "Standard_D2_v2";
const name = pulumi.getProject();
// export const sshPublicKey = config.require("sshPublicKey");
// Create an SSH public key that will be used by the Kubernetes cluster.
// Note: We create one here to simplify the demo, but a production
// deployment would probably pass an existing key in as a variable.
const sshPublicKey = new tls.PrivateKey(`${name}-sshKey`, {
    algorithm: "RSA",
    rsaBits: 4096,
}).publicKeyOpenssh;

// Create an Azure Resource Group
const resourceGroup = new azure.core.ResourceGroup("aks", { location });

// Step 2: Create the AD service principal for the k8s cluster.
const adApp = new azuread.Application("aks");
const adSp = new azuread.ServicePrincipal("aksSp", { applicationId: adApp.applicationId });
const adSpPassword = new azuread.ServicePrincipalPassword("aksSpPassword", {
    servicePrincipalId: adSp.id,
    value: password,
    endDate: "2099-01-01T00:00:00Z",
});

// Step 3: This step creates an AKS cluster.


export const k8sCluster = new azure.containerservice.KubernetesCluster("aksCluster", {
    resourceGroupName: resourceGroup.name,
    location: location,
    agentPoolProfiles: [{
        name: "aksagentpool",
        count: nodeCount,
        vmSize: nodeSize,
    }],
    dnsPrefix: `${pulumi.getStack()}-kube`,
    linuxProfile: {
        adminUsername: "aksuser",
        sshKey: { keyData: sshPublicKey, }
    },
    servicePrincipal: {
        clientId: adSp.applicationId,
        clientSecret: adSpPassword.value,
    },
    // addonProfile: {
    //     omsAgent: {
    //         enabled: true,
    //         logAnalyticsWorkspaceId: loganalytics.id,
    //     },
    // },
});

// Create a registry in ACR.
const registry = new azure.containerservice.Registry("myregistry", {
    resourceGroupName: resourceGroup.name,
    sku: "Basic",
    adminEnabled: true,
});


// Expose a k8s provider instance using our custom cluster instance.
export const k8sProvider = new k8s.Provider("aksK8s", {
    kubeconfig: k8sCluster.kubeConfigRaw,
});

// Export the kubeconfig
export const kubeconfig = k8sCluster.kubeConfigRaw
