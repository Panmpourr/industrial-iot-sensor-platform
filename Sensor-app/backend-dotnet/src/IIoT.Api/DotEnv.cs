namespace IIoT.Api;

/// <summary>
/// Loads KEY=VALUE pairs from the nearest <c>.env</c> file (current directory or a parent) into
/// environment variables, without overwriting variables that are already set. Used for local
/// <c>dotnet run</c>; in Docker the variables come from docker-compose.
/// </summary>
public static class DotEnv
{
    public static void Load()
    {
        for (var dir = new DirectoryInfo(Directory.GetCurrentDirectory()); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, ".env");
            if (!File.Exists(file))
            {
                continue;
            }

            foreach (var line in File.ReadAllLines(file))
            {
                var trimmed = line.Trim();
                var separator = trimmed.IndexOf('=');
                if (trimmed.Length == 0 || trimmed.StartsWith('#') || separator <= 0)
                {
                    continue;
                }

                var key = trimmed[..separator].Trim();
                var value = trimmed[(separator + 1)..].Trim().Trim('"');
                if (Environment.GetEnvironmentVariable(key) is null)
                {
                    Environment.SetEnvironmentVariable(key, value);
                }
            }
            return;
        }
    }
}
