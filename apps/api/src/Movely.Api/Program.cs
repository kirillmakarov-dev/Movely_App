using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Shared.Errors;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<MovelyDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("MovelyDb") ??
        "Host=localhost;Port=5432;Database=movely_dev;Username=postgres;Password=postgres";

    options.UseNpgsql(connectionString);
});

builder.Services.AddHealthChecks();
builder.Services.AddRouting();
builder.Services.AddHttpContextAccessor();
builder.Services.AddMovelyAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddMoveRequestsModule(builder.Configuration);
builder.Services.AddCors(options =>
{
    var allowedOrigins =
        builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ??
        ["http://localhost:3000"];

    options.AddPolicy("WebApp", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseMiddleware<ApiExceptionMiddleware>();
app.UseCors("WebApp");
app.UseMovelySecurity();

app.MapGet("/health", () =>
{
    return Results.Ok(new
    {
        status = "healthy",
        utcNow = DateTimeOffset.UtcNow
    });
});

app.MapIdentityEndpoints();
app.MapMoveRequestEndpoints();

app.Run();

public partial class Program
{
}
