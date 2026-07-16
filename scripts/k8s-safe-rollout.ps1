[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')]
    [string]$Deployment,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9._/:@-]+$')]
    [string]$Image,

    [ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')]
    [string]$Namespace = 'shopmate',

    [ValidateRange(30, 3600)]
    [int]$TimeoutSeconds = 300,

    [switch]$AutoRollback
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    throw 'kubectl is not installed or not available on PATH.'
}

$context = kubectl config current-context
if (-not $context) {
    throw 'No active kubectl context.'
}

$deploymentJson = kubectl get deployment $Deployment -n $Namespace -o json | ConvertFrom-Json
if (-not $deploymentJson) {
    throw "Deployment '$Deployment' was not found in namespace '$Namespace'."
}

$containerName = [string]$deploymentJson.spec.template.spec.containers[0].name
$previousImage = [string]$deploymentJson.spec.template.spec.containers[0].image

Write-Host "Context: $context"
Write-Host "Target:  deployment/$Deployment ($Namespace)"
Write-Host "Image:   $previousImage -> $Image"

if (-not $PSCmdlet.ShouldProcess("deployment/$Deployment in $Namespace", "set image to $Image")) {
    return
}

kubectl set image "deployment/$Deployment" "$containerName=$Image" -n $Namespace --record=false
if ($LASTEXITCODE -ne 0) {
    throw 'kubectl set image failed.'
}

kubectl rollout status "deployment/$Deployment" -n $Namespace "--timeout=${TimeoutSeconds}s"
if ($LASTEXITCODE -eq 0) {
    kubectl get pods -n $Namespace -l "app=$Deployment" -o wide
    Write-Host 'Rollout completed. Verify /ready and business smoke tests before declaring success.' -ForegroundColor Green
    return
}

Write-Error "Rollout failed. Previous image was $previousImage."
if ($AutoRollback) {
    Write-Warning 'AutoRollback is enabled; rolling back to the previous revision.'
    kubectl rollout undo "deployment/$Deployment" -n $Namespace
    kubectl rollout status "deployment/$Deployment" -n $Namespace "--timeout=${TimeoutSeconds}s"
    if ($LASTEXITCODE -ne 0) {
        throw 'Rollback also failed. Escalate to manual incident response.'
    }
    throw 'Rollout failed and was rolled back successfully.'
}

Write-Host "Rollback command: kubectl rollout undo deployment/$Deployment -n $Namespace" -ForegroundColor Yellow
throw 'Rollout failed. Automatic rollback was not requested.'
