using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace MarketCar.Api.Autenticacion;

/// <summary>
/// Descarga las claves públicas de firma (JWKS) de Supabase Auth.
/// El ConfigurationManager las cachea y las vuelve a pedir si aparece un "kid"
/// desconocido, así la API soporta la rotación de claves sin reiniciarse.
/// </summary>
public sealed class SupabaseJwksRetriever(string issuer) : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address, IDocumentRetriever retriever, CancellationToken cancel)
    {
        var json = await retriever.GetDocumentAsync(address, cancel);
        var jwks = new JsonWebKeySet(json);

        var configuracion = new OpenIdConnectConfiguration { Issuer = issuer, JwksUri = address };
        foreach (var clave in jwks.GetSigningKeys())
        {
            configuracion.SigningKeys.Add(clave);
        }
        return configuracion;
    }
}
