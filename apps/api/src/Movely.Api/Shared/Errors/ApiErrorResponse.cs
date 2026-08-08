namespace Movely.Api.Shared.Errors;

public sealed record ApiErrorResponse(
    string ErrorCode,
    string Message,
    object? Details,
    string CorrelationId);

