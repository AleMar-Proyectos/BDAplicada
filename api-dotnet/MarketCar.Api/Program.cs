using MarketCar.Api.Autenticacion;
using MarketCar.Api.Datos;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// ---- Base de datos (Supabase PostgreSQL) -----------------------------------
var cadena = builder.Configuration.GetConnectionString("Supabase");
if (string.IsNullOrWhiteSpace(cadena))
    throw new InvalidOperationException(
        "Falta ConnectionStrings:Supabase. Cargala con: dotnet user-secrets set \"ConnectionStrings:Supabase\" \"Host=...\"");

builder.Services.AddSingleton(NpgsqlDataSource.Create(cadena));
builder.Services.AddScoped<IUsuarioRepositorio, UsuarioRepositorio>();

// ---- Autenticación con los JWT de Supabase Auth ----------------------------
builder.Services.AddSupabaseJwt(builder.Configuration);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();

// Sin CORS a propósito: a esta API la llama solo el servidor Node (server-to-server),
// nunca el navegador directamente.

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
