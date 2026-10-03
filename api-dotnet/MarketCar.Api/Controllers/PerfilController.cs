using MarketCar.Api.Autenticacion;
using MarketCar.Api.Datos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MarketCar.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = Politicas.Administrador)]
public sealed class PerfilController(IUsuarioRepositorio usuarios, ILogger<PerfilController> logger) : ControllerBase
{
    /// <summary>
    /// GET /api/perfil — perfil del administrador autenticado.
    /// Solo llega acá un JWT de Supabase válido con app_metadata.rol = "admin".
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirst("sub")?.Value, out var idUsuario))
            return Unauthorized();

        var perfil = await usuarios.ObtenerPorIdAsync(idUsuario, ct);
        if (perfil is null || !perfil.Activo || perfil.Rol != "admin")
        {
            logger.LogWarning("Token válido pero perfil sin acceso: {IdUsuario}", idUsuario);
            return Forbid();
        }

        var expira = User.FindFirst("exp")?.Value is { } exp && long.TryParse(exp, out var segundos)
            ? DateTimeOffset.FromUnixTimeSeconds(segundos)
            : (DateTimeOffset?)null;

        return Ok(new
        {
            ok = true,
            validadoPor = "API .NET (ASP.NET Core) · firma JWT de Supabase",
            tokenExpira = expira,
            perfil,
        });
    }
}
