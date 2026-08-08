using System.Security.Cryptography;
using System.Text;

namespace Movely.Api.Infrastructure.Authentication;

public static class SecurityTokenHasher
{
    private static string? _sessionPepper;
    private static string? _otpPepper;

    public static void Configure(string sessionPepper, string otpPepper)
    {
        _sessionPepper = sessionPepper;
        _otpPepper = otpPepper;
    }

    public static string HashToken(string token)
    {
        var pepper = _sessionPepper ?? "movely-dev-session-pepper";
        return Hash(token, pepper);
    }

    public static string HashOtp(string code, string salt)
    {
        var pepper = _otpPepper ?? "movely-dev-otp-pepper";
        return Hash($"{salt}:{code}", pepper);
    }

    private static string Hash(string value, string pepper)
    {
        using var sha = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes($"{pepper}:{value}");
        return Convert.ToHexString(sha.ComputeHash(bytes));
    }
}

