namespace MarketCar.Api.Autenticacion;

/// <summary>
/// Sección "Supabase" de appsettings / user-secrets.
/// </summary>
public sealed class SupabaseOptions
{
    public const string Seccion = "Supabase";

    /// <summary>https://TU-PROYECTO.supabase.co</summary>
    public string Url { get; init; } = string.Empty;

    /// <summary>
    /// Solo para proyectos con la clave JWT "legacy" (HS256).
    /// Si queda vacío se usan las claves públicas del proyecto (JWKS, ES256/RS256),
    /// que es lo recomendado: la API no necesita conocer ningún secreto.
    /// </summary>
    public string? JwtSecret { get; init; }

    public string Issuer => $"{Url.TrimEnd('/')}/auth/v1";
    public string JwksUrl => $"{Issuer}/.well-known/jwks.json";
    public const string Audience = "authenticated";
}
