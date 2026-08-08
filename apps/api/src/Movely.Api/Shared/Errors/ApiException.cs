namespace Movely.Api.Shared.Errors;

public sealed class ApiException : Exception
{
    public ApiException(string errorCode, string message, object? details = null)
        : this(errorCode, message, 400, details)
    {
    }

    public ApiException(string errorCode, string message, int statusCode, object? details = null)
        : base(message)
    {
        ErrorCode = errorCode;
        StatusCode = statusCode;
        Details = details;
    }

    public string ErrorCode { get; }

    public int StatusCode { get; }

    public object? Details { get; }
}
