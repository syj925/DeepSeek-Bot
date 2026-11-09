param([Parameter(Mandatory=$true)][string]$BackupPath)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'qibitai\harness\bot\workspace'))
$item = Get-Item -LiteralPath $workspace
if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'The QibitAI workspace must be a real local directory.'
}
$acl = Get-Acl -LiteralPath $workspace
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$oldOwner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
if ($oldOwner.Value -eq $identity.User.Value) {
  Write-Output 'Workspace is already owned by the current user.'
  exit 0
}
if ($oldOwner.Value -ne 'S-1-5-32-544') { throw 'Unexpected owner. Ask an administrator to inspect this workspace.' }
if (Test-Path -LiteralPath $BackupPath) { throw 'Choose a new backup file; existing backups are never overwritten.' }
$dacl = $acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
@{ path=$workspace; owner=$oldOwner.Value; dacl=$dacl; at=(Get-Date).ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath $BackupPath -Encoding utf8
# Change only the root owner. Do not recurse, change grants, disable inheritance or sandboxing.
$acl.SetOwner($identity.User)
Set-Acl -LiteralPath $workspace -AclObject $acl
$after = Get-Acl -LiteralPath $workspace
if ($after.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value -or
  $after.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) -ne $dacl) {
  throw 'Workspace verification failed. Inspect the saved ACL backup before continuing.'
}
Write-Output 'Workspace owner repaired; access rules and inheritance unchanged.'
