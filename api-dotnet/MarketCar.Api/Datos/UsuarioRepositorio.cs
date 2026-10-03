using MarketCar.Api.Modelos;
using Npgsql;

namespace MarketCar.Api.Datos;

public interface IUsuarioRepositorio
{
    Task<PerfilDto?> ObtenerPorIdAsync(Guid idUsuario, CancellationToken ct);
}

/// <summary>
/// Lee public.perfiles en Supabase PostgreSQL con ADO.NET (Npgsql).
/// Consulta parametrizada: el id sale del JWT ya validado, nunca del body.
/// </summary>
public sealed class UsuarioRepositorio(NpgsqlDataSource dataSource) : IUsuarioRepositorio
{
    private const string Sql = """
        SELECT id_usuario,
               nombre_usuario::text,
               correo::text,
               nombre_completo,
               tipo_usuario,
               rol::text,
               activo,
               fecha_alta,
               ultimo_acceso
          FROM public.perfiles
         WHERE id_usuario = @id
        """;

    public async Task<PerfilDto?> ObtenerPorIdAsync(Guid idUsuario, CancellationToken ct)
    {
        await using var comando = dataSource.CreateCommand(Sql);
        comando.Parameters.AddWithValue("id", idUsuario);

        await using var lector = await comando.ExecuteReaderAsync(ct);
        if (!await lector.ReadAsync(ct)) return null;

        return new PerfilDto(
            Id: lector.GetGuid(0),
            Usuario: lector.GetString(1),
            Correo: lector.GetString(2),
            Nombre: lector.GetString(3),
            Tipo: lector.GetString(4),
            Rol: lector.GetString(5),
            Activo: lector.GetBoolean(6),
            FechaAlta: lector.GetFieldValue<DateTimeOffset>(7),
            UltimoAcceso: lector.IsDBNull(8) ? null : lector.GetFieldValue<DateTimeOffset>(8));
    }
}
