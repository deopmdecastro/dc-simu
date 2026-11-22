// Ensaio DC-Simu ↔ TIA: cria um projeto TIA Portal V21 temporário (sem interface), importa o SCL,
// compila e carrega o programa na instância PLCSIM Advanced pelo interface PLCSIM (Softbus).
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using Siemens.Engineering;
using Siemens.Engineering.Compiler;
using Siemens.Engineering.Connection;
using Siemens.Engineering.Download;
using Siemens.Engineering.Download.Configurations;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.SW;
using Siemens.Engineering.SW.ExternalSources;

public static class TiaDeploy
{
    const string Api = @"C:\Program Files\Siemens\Automation\Portal V21\PublicAPI\V21\net48";

    public static int Main(string[] args)
    {
        AppDomain.CurrentDomain.AssemblyResolve += (s, e) => {
            string p = Path.Combine(Api, e.Name.Split(',')[0] + ".dll");
            return File.Exists(p) ? Assembly.LoadFrom(p) : null;
        };
        try { return Run(args[0], args[1]); }
        catch (Exception ex) { Console.WriteLine("ERRO: " + ex.GetType().FullName + ": " + ex.Message); if (ex.InnerException != null) Console.WriteLine("  interno: " + ex.InnerException.Message);
            if (ex.GetType().Name == "EngineeringSecurityException") Console.WriteLine("  O TIA Portal abre a janela «Openness access» no ambiente de trabalho: autorize-a (por exemplo «Yes to all») antes de expirar e repita o ensaio.");
            return 1; }
    }

    static void Log(string m) { Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " " + m); }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static int Run(string workDir, string sclPath)
    {
        Log("A abrir o TIA Portal V21 sem interface…");
        using (var tia = new TiaPortal(TiaPortalMode.WithoutUserInterface))
        {
            var dir = new DirectoryInfo(Path.Combine(workDir, "proj"));
            dir.Create();
            string name = "DCSimuE2E_" + DateTime.Now.ToString("HHmmss");
            Project project = tia.Projects.Create(dir, name);
            Log("Projeto criado: " + name);

            // «Support simulation during block compilation»: sem isto o PLCSIM recusa os blocos ao carregar.
            var simSettings = project.GetService<PlcSimulationSettingsProvider>();
            if (simSettings != null) { simSettings.IsSimulationDuringBlockCompilationEnabled = true; Log("Simulação na compilação de blocos: " + simSettings.IsSimulationDuringBlockCompilationEnabled + " (projeto)"); }

            Device device = null;
            // A CPU virtual do PLCSIM Advanced V8 identifica-se como 6ES7 511-1CL03-0AB0 (ver certificado);
            // V3.1 primeiro: ainda usa níveis de acesso (a V4.0 exige «Users and roles» com um utilizador de
            // acesso total). O simulador aceita firmware igual ou inferior ao seu.
            foreach (string id in new[] { "6ES7 511-1CL03-0AB0/V3.1", "6ES7 511-1CL03-0AB0/V4.0", "6ES7 511-1CK01-0AB0/V2.9" }) {
                try { device = project.Devices.CreateWithItem("OrderNumber:" + id, "PLC_1", "PLC_1"); Log("CPU 1511C-1 PN " + id); break; }
                catch (Exception ex) { Log("  " + id + " indisponível: " + ex.Message.Split('\n')[0]); }
            }
            if (device == null) throw new Exception("Não foi possível criar a CPU 1511C.");

            DeviceItem cpu = null; PlcSoftware plc = null;
            Action<DeviceItemComposition> walk = null;
            walk = items => { foreach (DeviceItem it in items) {
                var sc = it.GetService<SoftwareContainer>();
                if (sc != null && sc.Software is PlcSoftware) { cpu = it; plc = (PlcSoftware)sc.Software; }
                walk(it.DeviceItems);
            } };
            walk(device.DeviceItems);
            if (plc == null) throw new Exception("PlcSoftware não encontrado.");
            Log("CPU: " + cpu.Name);

            // Só no projeto temporário e para uma CPU simulada: o V21 exige proteção configurada para compilar.
            // Acesso total e dados confidenciais sem palavra-passe, como num banco de ensaio sem rede.
            var access = cpu.GetService<PlcAccessLevelProvider>();
            if (access != null) { access.PlcProtectionAccessLevel = PlcProtectionAccessLevel.FullAccess; Log("Proteção: acesso total"); }
            var secret = cpu.GetService<PlcMasterSecretConfigurator>();
            if (secret != null) { secret.Unprotect(); Log("Dados confidenciais: " + secret.MasterSecretConfiguration); }
            if (access == null) GrantAnonymousFullAccess(project, cpu, plc);

            // Interface PROFINET X1: sub-rede e endereço fixos, iguais aos da instância PLCSIM (192.168.0.1).
            Action<DeviceItemComposition> nets = null;
            nets = items => { foreach (DeviceItem it in items) {
                var ni = it.GetService<NetworkInterface>();
                if (ni != null && ni.Nodes.Count > 0 && ni.InterfaceType == NetType.Ethernet) {
                    Node node = ni.Nodes.First();
                    try { node.SetAttribute("Address", "192.168.0.1"); } catch (Exception ex) { Log("  endereço: " + ex.Message.Split('\n')[0]); }
                    if (node.ConnectedSubnet == null) node.CreateAndConnectToSubnet("PN/IE_1");
                    Log("Interface " + it.Name + ": " + node.GetAttribute("Address") + " · sub-rede " + node.ConnectedSubnet.Name);
                }
                nets(it.DeviceItems);
            } };
            nets(device.DeviceItems);

            if (simSettings == null) {
                simSettings = plc.GetService<PlcSimulationSettingsProvider>();
                if (simSettings == null) throw new Exception("PlcSimulationSettingsProvider não disponível (projeto nem PlcSoftware).");
                simSettings.IsSimulationDuringBlockCompilationEnabled = true;
                Log("Simulação na compilação de blocos: " + simSettings.IsSimulationDuringBlockCompilationEnabled + " (PlcSoftware)");
            }

            var main = plc.BlockGroup.Blocks.Find("Main");
            if (main != null) { main.Delete(); Log("OB1 «Main» predefinido removido"); }
            PlcExternalSource src = plc.ExternalSourceGroup.ExternalSources.CreateFromFile("Estampagem.scl", sclPath);
            src.GenerateBlocksFromSource();
            Log("Blocos gerados: " + string.Join(", ", plc.BlockGroup.Blocks.Select(b => b.Name)));

            CompilerResult cr = cpu.GetService<ICompilable>().Compile();
            Log("Compilação: " + cr.State + " · erros " + cr.ErrorCount + " · avisos " + cr.WarningCount);
            Action<CompilerResultMessageComposition, string> dump = null;
            dump = (msgs, ind) => { foreach (CompilerResultMessage m in msgs) {
                if (m.State != CompilerResultState.Success || m.ErrorCount > 0) Log(ind + m.State + " · " + m.Path + " · " + m.Description);
                dump(m.Messages, ind + "  ");
            } };
            dump(cr.Messages, "  ");
            if (cr.ErrorCount > 0) return 3;

            DownloadProvider dp = cpu.GetService<DownloadProvider>();
            ConfigurationMode mode = dp.Configuration.Modes.Find("PN/IE");
            Log("Interfaces PG/PC: " + string.Join(" | ", mode.PcInterfaces.Select(p => p.Name + " #" + p.Number)));
            ConfigurationPcInterface pc = mode.PcInterfaces.Find("PLCSIM", 1) ?? mode.PcInterfaces.FirstOrDefault(p => p.Name.IndexOf("PLCSIM", StringComparison.OrdinalIgnoreCase) >= 0);
            if (pc == null) throw new Exception("Interface PLCSIM não disponível.");
            ConfigurationTargetInterface target = pc.TargetInterfaces.First();
            Log("Download via «" + pc.Name + "» → " + target.Name);

            dp.Configuration.OnlineLegitimation += Legitimation;
            DownloadResult res = null;
            for (int attempt = 1; res == null; attempt++) {
                try { res = dp.Download(target, Pre, Post, DownloadOptions.Hardware | DownloadOptions.Software); }
                catch (Exception ex) {
                    Log("  tentativa " + attempt + " falhou: " + ex.Message.Replace("\r", " ").Replace("\n", " "));
                    Diagnose(cpu);
                    if (attempt >= 3) throw;
                    System.Threading.Thread.Sleep(10000);
                }
            }
            Log("Download: " + res.State + " · erros " + res.ErrorCount + " · avisos " + res.WarningCount);
            Action<DownloadResultMessageComposition, string> dumpDl = null;
            dumpDl = (msgs, ind) => { foreach (DownloadResultMessage m in msgs) { Log(ind + m.State + " · " + m.Message); dumpDl(m.Messages, ind + "  "); } };
            dumpDl(res.Messages, "  ");
            project.Close();
            return res.ErrorCount > 0 ? 4 : 0;
        }
    }

    // Firmware com «Users and roles» (S7-1500 ≥ V3.1): a compilação exige um utilizador com o direito de
    // execução «Full access». Só neste projeto temporário e para a CPU simulada, ativa-se o utilizador
    // anónimo com uma função que tem esse direito (equivalente ao antigo «sem proteção»).
    static void GrantAnonymousFullAccess(Project project, DeviceItem cpu, PlcSoftware plc)
    {
        var umac = project.GetService<Siemens.Engineering.Umac.UmacConfigurator>();
        if (umac == null) throw new Exception("UmacConfigurator não disponível no projeto.");
        Siemens.Engineering.Umac.UmacDevice dev = plc.GetService<Siemens.Engineering.Umac.UmacDevice>();
        string where = "PlcSoftware";
        if (dev == null) { dev = ((Device)FindDevice(cpu)).GetService<Siemens.Engineering.Umac.UmacDevice>(); where = "Device"; }
        if (dev == null) {
            Func<DeviceItemComposition, DeviceItem> scan = null;
            scan = items => { foreach (DeviceItem it in items) { if (it.GetService<Siemens.Engineering.Umac.UmacDevice>() != null) return it; var r = scan(it.DeviceItems); if (r != null) return r; } return null; };
            var holder = scan(((Device)FindDevice(cpu)).DeviceItems);
            if (holder != null) { dev = holder.GetService<Siemens.Engineering.Umac.UmacDevice>(); where = "DeviceItem " + holder.Name; }
        }
        if (dev == null) throw new Exception("UmacDevice não disponível (PlcSoftware, Device e DeviceItems).");
        Log("UmacDevice em " + where);
        var rights = dev.AvailableDeviceFunctionRights.ToList();
        Log("Direitos da CPU: " + string.Join(" | ", rights.Select(r => r.Name + " [" + r.Identifier + "]")));
        var full = rights.FirstOrDefault(r => r.Name.IndexOf("Full access", StringComparison.OrdinalIgnoreCase) >= 0 && r.Name.IndexOf("fail", StringComparison.OrdinalIgnoreCase) < 0)
                ?? rights.First(r => r.Name.IndexOf("Full access", StringComparison.OrdinalIgnoreCase) >= 0);
        var role = umac.CustomRoles.Find("DCSimu_E2E_Full") ?? umac.CustomRoles.Create("DCSimu_E2E_Full", "Ensaio DC-Simu: acesso total à CPU simulada");
        role.AssignDeviceFunctionRight(dev, full);
        umac.ActivateAnonymousUser();
        var anon = umac.AnonymousUser;
        if (!anon.Roles.Contains(role)) anon.Roles.Add(role);
        Log("Users and roles: utilizador anónimo ativo com «" + full.Name + "» (só no projeto temporário)");
    }

    static IEngineeringObject FindDevice(IEngineeringObject o)
    {
        while (o != null && !(o is Device)) o = o.Parent;
        return o;
    }

    static bool onlineSubscribed;

    // Diagnóstico de ligação: tenta ficar online pelo mesmo interface e regista o erro completo.
    static void Diagnose(DeviceItem cpu)
    {
        try {
            var op = cpu.GetService<Siemens.Engineering.Online.OnlineProvider>();
            var mode = op.Configuration.Modes.Find("PN/IE");
            var pc = mode.PcInterfaces.Find("PLCSIM", 1);
            Log("  online: interface " + pc.Name + " · alvos " + string.Join(", ", pc.TargetInterfaces.Select(t => t.Name)));
            op.Configuration.ApplyConfiguration(pc.TargetInterfaces.First());
            if (!onlineSubscribed) { op.Configuration.OnlineLegitimation += Legitimation; onlineSubscribed = true; }
            Log("  online: estado " + op.GoOnline());
            op.GoOffline();
        } catch (Exception ex) {
            for (Exception e = ex; e != null; e = e.InnerException) Log("  online: " + e.GetType().Name + ": " + e.Message.Replace("\r", " ").Replace("\n", " "));
        }
    }

    // A CPU virtual acabada de criar pelo ensaio apresenta um certificado TLS autoassinado. Confia-se
    // nele só aqui (instância local no Softbus, sem rede) e regista-se a impressão digital como evidência.
    static void Legitimation(Siemens.Engineering.Online.Configurations.OnlineConfiguration c)
    {
        var tls = c as Siemens.Engineering.Online.Configurations.TlsVerificationConfiguration;
        if (tls != null) {
            foreach (var vc in tls.Certificates) Log("  certificado de " + tls.PlcName + ": " + vc.Certificate.Subject + " · SHA1 " + vc.Certificate.Thumbprint);
            tls.CurrentSelection = Siemens.Engineering.Online.Configurations.TlsVerificationConfigurationSelection.Trusted;
            Log("  TLS: confiado (" + tls.VerificationInfo.Replace("\r", " ").Replace("\n", " ") + ")");
            return;
        }
        Log("  legitimação: " + c.GetType().Name);
    }

    static void Pre(DownloadConfiguration c)
    {
        var stop = c as StopModules; if (stop != null) stop.CurrentSelection = StopModulesSelections.StopAll;
        var cons = c as ConsistentBlocksDownload; if (cons != null) cons.CurrentSelection = ConsistentBlocksDownloadSelections.ConsistentDownload;
        var lang = c as OverwriteTargetLanguages; if (lang != null) lang.Checked = true;
        var db = c as DataBlockReinitialization; if (db != null) db.CurrentSelection = DataBlockReinitializationSelections.StopPlcAndReinitialize;
        var prot = c as ProtectionLevelChanged; if (prot != null) prot.CurrentSelection = ProtectionLevelChangedSelections.ContinueDownloading;
        // A instância é criada pelo próprio ensaio: repor a CPU (certificados, configuração anterior) é seguro.
        var reset = c as ResetModule; if (reset != null) reset.CurrentSelection = ResetModuleSelections.DeleteAll;
        Generic(c, "antes");
    }

    static void Post(DownloadConfiguration c)
    {
        var start = c as StartModules; if (start != null) start.CurrentSelection = StartModulesSelections.StartModule;
        Generic(c, "depois");
    }

    // Diálogos não previstos: confirma caixas («Checked») e regista as opções para diagnóstico.
    static void Generic(DownloadConfiguration c, string phase)
    {
        var t = c.GetType();
        var chk = t.GetProperty("Checked");
        if (chk != null && chk.CanWrite) chk.SetValue(c, true);
        var sel = t.GetProperty("CurrentSelection");
        // Pergunta não prevista que ficou em «não fazer nada»: o TIA Portal recusa o download («unhandled»).
        // Só nesta instância de ensaio, escolhe-se a primeira opção que avança, e fica registado.
        if (sel != null && sel.CanWrite && sel.PropertyType.IsEnum) {
            string cur = sel.GetValue(c).ToString();
            if (cur.StartsWith("No", StringComparison.Ordinal)) {
                string next = Enum.GetNames(sel.PropertyType).FirstOrDefault(n => !n.StartsWith("No", StringComparison.Ordinal));
                if (next != null) { sel.SetValue(c, Enum.Parse(sel.PropertyType, next)); Log("  (automático) " + t.Name + ": " + cur + " → " + next); }
            }
        }
        string opts = sel != null ? " [" + string.Join(",", Enum.GetNames(sel.PropertyType)) + "] = " + sel.GetValue(c) : (chk != null ? " Checked=" + chk.GetValue(c) : "");
        Log("  diálogo " + phase + ": " + t.Name + opts + " · " + c.Message);
    }
}
