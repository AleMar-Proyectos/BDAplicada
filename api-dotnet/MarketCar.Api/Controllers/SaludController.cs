using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace MarketCar.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public sealed class SaludController(NpgsqlDataSource dataSource) : ControllerBase
{
    /// <summary>GET /api/salud — estado de la API y de la conexión a Supabase.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            await using var comando = dataSource.CreateCommand("SELECT 1");
            await comando.ExecuteScalarAsync(ct);
            return Ok(new { ok = true, baseDeDatos = "conectada" });
        }
        catch (Exception)
        {
            return StatusCode(503, new { ok = false, baseDeDatos = "sin conexión" });
        }
    }
}
