using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;
using Movely.Api.Data;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Modules.Localities;
using Movely.Api.Modules.Marketplace;
using Movely.Api.Modules.Businesses;
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
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddHttpContextAccessor();
builder.Services.AddMovelyAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddMoveRequestsModule(builder.Configuration);
builder.Services.AddLocalitiesModule();
builder.Services.AddMarketplaceModule();
builder.Services.AddBusinessesModule();
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
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseMiddleware<ApiExceptionMiddleware>();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api/v1"))
    {
        // Apply when headers are sent, including errors whose handler clears the response.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Task.CompletedTask;
        });
    }
    await next();
});
app.UseCors("WebApp");
app.UseMovelySecurity();
app.UseRateLimiter();

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
app.MapLocalityEndpoints();
app.MapMarketplaceEndpoints();
app.MapBusinessEndpoints();

app.Run();

public partial class Program
{
}
