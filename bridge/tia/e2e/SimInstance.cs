// Ensaio DC-Simu ↔ TIA: gere a instância PLCSIM Advanced usada no ensaio (compila contra o SDK local).
using System;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using Siemens.Simatic.Simulation.Runtime;

public static class SimInstance
{
    public static int Main(string[] args)
    {
        string sdk = args[0];
        AppDomain.CurrentDomain.AssemblyResolve += (s, e) => e.Name.Split(',')[0] == "Siemens.Simatic.Simulation.Runtime.Api.x64" ? Assembly.LoadFrom(sdk) : null;
        try { return Do(args.Skip(1).ToArray()); }
        catch (Exception ex) { Console.WriteLine("ERRO: " + ex.GetType().Name + ": " + ex.Message); return 1; }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static int Do(string[] a)
    {
        string cmd = a[0], name = a.Length > 1 ? a[1] : "DCSIMU_E2E";
        Console.WriteLine("Runtime API v" + SimulationRuntimeManager.Version.ToString("X") + " · NetworkMode=" + SimulationRuntimeManager.NetworkMode);
        if (cmd == "list") {
            foreach (var i in SimulationRuntimeManager.RegisteredInstanceInfo) Console.WriteLine("  instância: " + i.Name + " (id " + i.ID + ")");
            return 0;
        }
        if (cmd == "create") {
            if (SimulationRuntimeManager.RegisteredInstanceInfo.Any(i => i.Name == name)) { Console.WriteLine("Já existe: " + name); return 0; }
            var inst = SimulationRuntimeManager.RegisterInstance(ECPUType.CPU1511C, name);
            Console.WriteLine("Registada: " + inst.Name + " · CPU " + inst.CPUType + " · comunicação " + inst.CommunicationInterface + " · " + inst.StoragePath);
            inst.PowerOn(60000);
            Console.WriteLine("Ligada · estado " + inst.OperatingState);
            return 0;
        }
        IInstance x = SimulationRuntimeManager.CreateInterface(name);
        if (cmd == "state") { Console.WriteLine("Estado " + x.OperatingState + " · CPU " + x.CPUType + " · " + x.CommunicationInterface + " · IP " + string.Join(",", (x.ControllerIPSuite4 ?? new SIPSuite4[0]).Select(p => p.IPAddress.IPString))); return 0; }
        if (cmd == "run") { x.Run(60000); Console.WriteLine("Estado " + x.OperatingState); return 0; }
        if (cmd == "stop") { x.Stop(60000); Console.WriteLine("Estado " + x.OperatingState); return 0; }
        if (cmd == "remove") { try { x.PowerOff(60000); } catch { } x.UnregisterInstance(); Console.WriteLine("Removida: " + name); return 0; }
        Console.WriteLine("Comando desconhecido"); return 2;
    }
}
