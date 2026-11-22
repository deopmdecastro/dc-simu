// Compila contra o SDK local da Siemens. Não redistribuir as DLLs do fabricante.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Siemens.Simatic.Simulation.Runtime;

public static class PlcsimAdapter
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    static IInstance Instance;
    static string[] Inputs = new string[0], Outputs = new string[0];
    static readonly Regex Address = new Regex(@"^[IQ](0|[1-9]\d{0,4})\.[0-7]$", RegexOptions.CultureInvariant);

    public static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        if (args.Length != 1) { Console.Error.WriteLine("Indique o caminho da DLL x64 do SDK PLCSIM Advanced."); return 2; }
        string sdk = System.IO.Path.GetFullPath(args[0]);
        AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs e) {
            return e.Name.Split(',')[0] == "Siemens.Simatic.Simulation.Runtime.Api.x64" ? Assembly.LoadFrom(sdk) : null;
        };
        return Serve();
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static int Serve()
    {
        string line;
        try {
            while ((line = Console.ReadLine()) != null) {
                object id = null;
                try {
                    // O pipe do Windows PowerShell 5.1 pode prefixar um BOM UTF-8.
                    var request = Json.Deserialize<Dictionary<string, object>>(line.TrimStart('﻿'));
                    id = request["id"];
                    object result = Handle(request);
                    Console.WriteLine(Json.Serialize(new { id = id, ok = true, result = result }));
                } catch (Exception e) {
                    ReleaseInputs();
                    Console.WriteLine(Json.Serialize(new { id = id, ok = false, error = e.Message }));
                }
            }
        } finally { ReleaseInputs(); }
        return 0;
    }

    static object Handle(Dictionary<string, object> request)
    {
        string method = Convert.ToString(request["method"]);
        if (method == "list") {
            return new { instances = SimulationRuntimeManager.RegisteredInstanceInfo.Select(i => new { name = i.Name }).ToArray() };
        }
        if (method == "disconnect") { ReleaseInputs(); return new { disconnected = true }; }
        if (method == "connect") {
            if (Instance != null) throw new InvalidOperationException("Já existe uma CPU ligada à ponte.");
            string name = Convert.ToString(request["instanceName"]);
            if (!SimulationRuntimeManager.RegisteredInstanceInfo.Any(i => i.Name == name)) throw new InvalidOperationException("Instância PLCSIM Advanced não encontrada. Crie-a no PLCSIM e carregue o programa no TIA Portal.");
            string[] inputs = Addresses(request["inputs"], 'I'), outputs = Addresses(request["outputs"], 'Q');
            Instance = SimulationRuntimeManager.CreateInterface(name);
            // Validação completa antes de adquirir qualquer entrada.
            foreach (string a in inputs) if (ByteOffset(a) >= Instance.InputArea.AreaSize) throw new ArgumentException("Entrada fora da área da CPU: " + a);
            foreach (string a in outputs) if (ByteOffset(a) >= Instance.OutputArea.AreaSize) throw new ArgumentException("Saída fora da área da CPU: " + a);
            Inputs = inputs; Outputs = outputs;
            return new { cpuState = Instance.OperatingState.ToString() };
        }
        if (method != "exchange" || Instance == null) throw new InvalidOperationException("Ligue uma instância antes de trocar E/S.");
        var values = request["inputs"] as Dictionary<string, object>;
        if (values == null || values.Count != Inputs.Length || Inputs.Any(a => !values.ContainsKey(a) || !(values[a] is bool))) throw new ArgumentException("Imagem de entradas incompleta ou inválida.");
        foreach (string a in Inputs) Instance.InputArea.WriteBit(ByteOffset(a), BitOffset(a), (bool)values[a]);
        var acknowledged = new Dictionary<string, bool>();
        foreach (string a in Inputs) acknowledged[a] = Instance.InputArea.ReadBit(ByteOffset(a), BitOffset(a));
        var read = new Dictionary<string, bool>();
        bool run = Instance.OperatingState == EOperatingState.Run;
        foreach (string a in Outputs) read[a] = run && Instance.OutputArea.ReadBit(ByteOffset(a), BitOffset(a));
        return new { cpuState = Instance.OperatingState.ToString(), inputs = acknowledged, outputs = read };
    }

    static string[] Addresses(object raw, char prefix)
    {
        var array = raw as object[];
        if (array == null || array.Length == 0 || array.Length > 256) throw new ArgumentException("Mapeamento vazio ou demasiado extenso.");
        var result = array.Select(Convert.ToString).ToArray();
        if (result.Any(a => !Address.IsMatch(a) || a[0] != prefix || ByteOffset(a) > 65535) || result.Distinct().Count() != result.Length) throw new ArgumentException("Endereços inválidos ou repetidos.");
        return result;
    }
    static uint ByteOffset(string address) { return uint.Parse(address.Substring(1, address.IndexOf('.') - 1), CultureInfo.InvariantCulture); }
    static byte BitOffset(string address) { return byte.Parse(address.Substring(address.IndexOf('.') + 1), CultureInfo.InvariantCulture); }
    static void ReleaseInputs()
    {
        if (Instance != null) {
            foreach (string a in Inputs) { try { Instance.InputArea.WriteBit(ByteOffset(a), BitOffset(a), false); } catch { } }
            try { Instance.Dispose(); } catch { }
        }
        Instance = null; Inputs = new string[0]; Outputs = new string[0];
    }
}
