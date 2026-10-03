using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace MarketCar.Api.Autenticacion;

public static class Politicas
{
    public const string Administrador = "Administrador";
}

public static class SupabaseJwtExtensions
{
    /// <summary>Claim propio donde se deja el rol leído de app_metadata.</summary>
    public const string ClaimRol = "rol";

    /// <summary>
    /// Configura la validación de los JWT emitidos por Supabase Auth:
    /// firma, emisor (issuer), audiencia y expiración.
    /// </summary>
    public static IServiceCollection AddSupabaseJwt(this IServiceCollection services, IConfiguration configuration)
    {
        var opciones = configuration.GetSection(SupabaseOptions.Seccion).Get<SupabaseOptions>()
                       ?? throw new InvalidOperationException("Falta la sección 'Supabase' en la configuración.");

        if (string.IsNullOrWhiteSpace(opciones.Url))
            throw new InvalidOperationException("Falta 'Supabase:Url' en la configuración.");

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt =>
            {
                jwt.MapInboundClaims = false; // conservar los nombres originales: sub, email, app_metadata…
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = opciones.Issuer,
                    ValidateAudience = true,
                    ValidAudience = SupabaseOptions.Audience,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    ValidateIssuerSigningKey = true,
                    NameClaimType = "email",
                    RoleClaimType = ClaimRol,
                };

                if (!string.IsNullOrWhiteSpace(opciones.JwtSecret))
                {
                    // Proyecto con clave legacy HS256 (secreto compartido)
                    jwt.TokenValidationParameters.IssuerSigningKey =
                        new SymmetricSecurityKey(Encoding.UTF8.GetBytes(opciones.JwtSecret));
                }
                else
                {
                    // Proyecto con claves asimétricas: se validan con la clave pública (JWKS)
                    jwt.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                        opciones.JwksUrl,
                        new SupabaseJwksRetriever(opciones.Issuer),
                        new HttpDocumentRetriever { RequireHttps = true });
                }

                jwt.Events = new JwtBearerEvents
                {
                    OnTokenValidated = contexto =>
                    {
                        AgregarClaimRol(contexto.Principal);
                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(Politicas.Administrador, politica => politica
                .RequireAuthenticatedUser()
                .RequireClaim(ClaimRol, "admin")
                .RequireClaim("activo", "true"));

        return services;
    }

    /// <summary>
    /// Supabase pone el rol de negocio dentro del objeto app_metadata (lo carga
    /// el trigger tg_perfiles_sincronizar_jwt). Acá se "aplana" a claims simples.
    /// </summary>
    private static void AgregarClaimRol(ClaimsPrincipal? principal)
    {
        if (principal?.Identity is not ClaimsIdentity identidad) return;

        var appMetadata = identidad.FindFirst("app_metadata")?.Value;
        if (string.IsNullOrEmpty(appMetadata)) return;

        try
        {
            using var doc = JsonDocument.Parse(appMetadata);
            if (doc.RootElement.TryGetProperty("rol", out var rol) && rol.ValueKind == JsonValueKind.String)
                identidad.AddClaim(new Claim(ClaimRol, rol.GetString()!));

            var activo = !doc.RootElement.TryGetProperty("activo", out var a) || a.ValueKind != JsonValueKind.False;
            identidad.AddClaim(new Claim("activo", activo ? "true" : "false"));
        }
        catch (JsonException)
        {
            // app_metadata mal formado → no se agregan claims → la política lo rechaza
        }
    }
}
