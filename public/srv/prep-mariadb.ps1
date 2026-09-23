# Preparación de MariaDB x64 en paralelo al MySQL 5.1 de Factory (23-sep-2026).
# NO toca el MySQL actual: instala MariaDB en E:\MariaDB, puerto 3307, servicio
# "MariaDB", y deja programada la copia de la base para la noche.
# Todo queda registrado en E:\MariaDB-setup\prep.log.
param([string]$Serie = '10.11')
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'E:\MariaDB-setup'
New-Item -ItemType Directory -Force $base | Out-Null
$log = "$base\prep.log"
function L($m) { $s = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"; Write-Host $s; Add-Content -Path $log -Value $s }
L "===== prep-mariadb serie $Serie ====="
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { L "TLS12: $_" }

# ---- 0. Credenciales del MySQL actual: las del DSN (no se muestran ni se guardan)
$dsn = Get-ItemProperty 'HKLM:\SOFTWARE\Wow6432Node\ODBC\ODBC.INI\Factory_MisBordados' -ErrorAction SilentlyContinue
$uid51 = $dsn.UID; $pwd51 = $dsn.PWD
if (-not $uid51 -or -not $pwd51) { L "ERROR: el DSN no trae UID/PWD; no puedo seguir sin credenciales."; exit 1 }
L "DSN usuario: $uid51 (clave leída, no se registra)"

# ---- 1. Última versión estable de la serie, archivo MSI x64 y su sha256
$rel = $null
try {
  $api = Invoke-RestMethod -Uri "https://downloads.mariadb.org/rest-api/mariadb/$Serie/" -TimeoutSec 60
  $vers = @($api.releases.PSObject.Properties | ForEach-Object { $_.Name }) | Sort-Object { [version]$_ } -Descending
  foreach ($v in $vers) {
    $r = $api.releases.$v
    $f = @($r.files) | Where-Object { $_.file_name -like '*winx64.msi' } | Select-Object -First 1
    if ($f -and ($r.release_status -eq 'Stable' -or -not $r.release_status)) { $rel = @{ v = $v; url = $f.file_download_url; sha = $f.checksum.sha256sum; name = $f.file_name }; break }
  }
} catch { L "API mariadb.org: $_" }
if (-not $rel) { L "ERROR: no encontré un MSI winx64 estable para la serie $Serie"; exit 1 }
L "Versión elegida: $($rel.v) · $($rel.name)"

# ---- 2. Descarga y verificación
$msi = "$base\$($rel.name)"
if (-not (Test-Path $msi) -or (Get-Item $msi).Length -lt 50MB) {
  L "Descargando $($rel.url)"
  try { Invoke-WebRequest -Uri $rel.url -OutFile $msi -TimeoutSec 1800 -UseBasicParsing } catch { L "Descarga: $_" }
}
if (-not (Test-Path $msi)) { L "ERROR: no se descargó el instalador"; exit 1 }
$sha = (Get-FileHash $msi -Algorithm SHA256).Hash.ToLower()
L "Tamaño $([int]((Get-Item $msi).Length/1MB)) MB · sha256 $sha"
if ($rel.sha -and $sha -ne $rel.sha.ToLower()) { L "ERROR: el sha256 no coincide ($($rel.sha)). Instalador descartado."; Remove-Item $msi -Force; exit 1 }
L "Firma verificada."

# ---- 3. Instalación silenciosa en paralelo (puerto 3307)
$svc = Get-Service -Name MariaDB -ErrorAction SilentlyContinue
if ($svc) { L "El servicio MariaDB ya existe: $($svc.Status). Salto la instalación." }
else {
  $args = "/i `"$msi`" /qn /L*v `"$base\install.log`" INSTALLDIR=`"E:\MariaDB`" DATADIR=`"E:\MariaDB\data`" PORT=3307 SERVICENAME=MariaDB PASSWORD=`"$pwd51`" ALLOWREMOTEROOTACCESS=0 UTF8=0 BUFFERPOOLSIZE=1024"
  L "Instalando (msiexec, unos minutos)…"
  $p = Start-Process msiexec.exe -ArgumentList $args -Wait -PassThru
  L "msiexec terminó con código $($p.ExitCode)"
  if ($p.ExitCode -ne 0) { L "ERROR: instalación fallida; ver $base\install.log"; exit 1 }
}

# ---- 4. Ajustes para que se comporte como el 5.1 de Factory y use la RAM
$ini = 'E:\MariaDB\data\my.ini'
if (-not (Test-Path $ini)) { $ini = Get-ChildItem 'E:\MariaDB' -Recurse -Filter my.ini | Select-Object -First 1 -ExpandProperty FullName }
L "my.ini: $ini"
if ($ini -and (Test-Path $ini) -and -not (Select-String -Path $ini -Pattern 'ajustes-factory' -Quiet)) {
  Copy-Item $ini "$ini.bak_instalacion"
  $extra = @"

# --- ajustes-factory (Claude, 23-sep-2026): igual comportamiento que MySQL 5.1 + memoria
sql_mode=STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION
character-set-server=latin1
collation-server=latin1_swedish_ci
lower_case_table_names=1
max_allowed_packet=256M
innodb_buffer_pool_size=8G
innodb_log_file_size=512M
tmp_table_size=256M
max_heap_table_size=256M
table_open_cache=2000
innodb_flush_log_at_trx_commit=1
log_bin_trust_function_creators=1
"@
  Add-Content -Path $ini -Value $extra
  L "my.ini ampliado; reiniciando el servicio"
  Restart-Service MariaDB -ErrorAction SilentlyContinue
  Start-Sleep 8
}
$svc = Get-Service -Name MariaDB -ErrorAction SilentlyContinue
L "Servicio MariaDB: $($svc.Status)"
$env:MYSQL_PWD = $pwd51
$ver = & 'E:\MariaDB\bin\mysql.exe' -uroot --port=3307 -N -e "SELECT VERSION(), @@innodb_buffer_pool_size/1073741824, @@sql_mode, @@character_set_server" 2>&1
L "MariaDB responde: $ver"

# ---- 5. Script de copia (dump 5.1 → import 3307) y tarea programada para esta noche
$imp = @'
$ErrorActionPreference = 'Continue'
$base = 'E:\MariaDB-setup'; $log = "$base\import.log"
function L($m) { $s = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"; Add-Content -Path $log -Value $s }
$dsn = Get-ItemProperty 'HKLM:\SOFTWARE\Wow6432Node\ODBC\ODBC.INI\Factory_MisBordados'
$env:MYSQL_PWD = $dsn.PWD
$b51 = 'C:\Program Files (x86)\MySQL\MySQL Server 5.1\bin'; $bm = 'E:\MariaDB\bin'
$dump = "$base\factory.sql"
L "===== copia de factory 5.1 -> MariaDB 3307 ====="
$sw = [Diagnostics.Stopwatch]::StartNew()
cmd /c "`"$b51\mysqldump.exe`" -u$($dsn.UID) --port=3306 --single-transaction --quick --hex-blob --routines --events --triggers --max_allowed_packet=256M --default-character-set=latin1 factory > `"$dump`" 2> `"$base\dump.err`""
L "dump: $([int]((Get-Item $dump).Length/1MB)) MB en $([int]$sw.Elapsed.TotalSeconds) s; errores: $((Get-Content "$base\dump.err" -ErrorAction SilentlyContinue) -join ' ')"
$sw.Restart()
& "$bm\mysql.exe" -uroot --port=3307 -e "DROP DATABASE IF EXISTS factory; CREATE DATABASE factory DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci" 2>&1 | ForEach-Object { L "prep: $_" }
cmd /c "`"$bm\mysql.exe`" -uroot --port=3307 --default-character-set=latin1 --max_allowed_packet=256M factory < `"$dump`" 2> `"$base\import.err`""
L "import en $([int]$sw.Elapsed.TotalSeconds) s; errores: $((Get-Content "$base\import.err" -ErrorAction SilentlyContinue | Select-Object -First 20) -join ' | ')"
# usuarios con la MISMA clave (hash) que en 5.1
$rows = & "$b51\mysql.exe" -u$($dsn.UID) --port=3306 -N -e "SELECT user, host, password FROM mysql.user WHERE user IN ('factory_user','root') AND password<>''" 2>&1
foreach ($r in @($rows)) { $p = "$r" -split "`t"; if ($p.Count -eq 3) {
  $q = "CREATE USER IF NOT EXISTS '$($p[0])'@'$($p[1])' IDENTIFIED BY PASSWORD '$($p[2])'; GRANT ALL PRIVILEGES ON *.* TO '$($p[0])'@'$($p[1])' WITH GRANT OPTION; FLUSH PRIVILEGES"
  & "$bm\mysql.exe" -uroot --port=3307 -e $q 2>&1 | ForEach-Object { L "usuario $($p[0])@$($p[1]): $_" }
} }
# comparación de conteos y tiempos
function T($bin, $port, $sql) { $s = [Diagnostics.Stopwatch]::StartNew(); $r = & "$bin\mysql.exe" -uroot --port=$port -N -e $sql factory 2>&1; "$([int]$s.ElapsedMilliseconds) ms -> $r" }
$tests = @(
  @('tablas', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='factory'"),
  @('vistas', "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='factory'"),
  @('rutinas', "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='factory'"),
  @('salidas', 'SELECT COUNT(*) FROM salidas_talleres'),
  @('fotos', 'SELECT COUNT(*), SUM(LENGTH(Foto)) FROM productos_fotos'),
  @('insumos de la salida 11222', 'SELECT COUNT(*) FROM vista_insumos_totales_salida_taller WHERE codigo_salida=11222'),
  @('detalle salida 11222', 'SELECT COUNT(*) FROM vista_detalle_salidas_talleres WHERE codigo_salida=11222'),
  @('detalle salidas completo', 'SELECT COUNT(*) FROM vista_detalle_salidas_talleres'),
  @('tela principal', 'SELECT COUNT(*) FROM vista_tela_principal_ordenes_corte_detalle'),
  @('estado avance ordenes', 'SELECT COUNT(*) FROM vista_estado_avance_ordenes_corte')
)
foreach ($t in $tests) { L ("{0,-30} 5.1: {1,-28} MariaDB: {2}" -f $t[0], (T $b51 3306 $t[1]), (T $bm 3307 $t[1])) }
L "===== fin ====="
'@
Set-Content -Path "$base\import-mariadb.ps1" -Value $imp -Encoding UTF8
$hora = Get-Date -Hour 21 -Minute 0 -Second 0
if ($hora -lt (Get-Date)) { $hora = $hora.AddDays(1) }
try {
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -File `"$base\import-mariadb.ps1`""
  $trg = New-ScheduledTaskTrigger -Once -At $hora
  Register-ScheduledTask -TaskName 'MariaDB-copia-factory' -Action $act -Trigger $trg -RunLevel Highest -User 'SYSTEM' -Force | Out-Null
  L "Tarea 'MariaDB-copia-factory' programada para $hora (una sola vez)."
} catch { L "Tarea programada: $_" }
L "===== prep terminado ====="
