namespace Movely.Api.Modules.Localities;

public static class LocalitiesModule
{
    public static IServiceCollection AddLocalitiesModule(this IServiceCollection services)
    {
        // Fail during startup if the packaged, reviewed catalog is incomplete or corrupt.
        services.AddSingleton<ILocalityCatalog>(new LocalityCatalog());
        return services;
    }

    public static IEndpointRouteBuilder MapLocalityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/localities", (ILocalityCatalog catalog) => Results.Ok(catalog.All))
            .AllowAnonymous();
        return app;
    }
}
