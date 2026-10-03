namespace MarketCar.Api.Modelos;

public sealed record PerfilDto(
    Guid Id,
    string Usuario,
    string Correo,
    string Nombre,
    string Tipo,
    string Rol,
    bool Activo,
    DateTimeOffset FechaAlta,
    DateTimeOffset? UltimoAcceso);
