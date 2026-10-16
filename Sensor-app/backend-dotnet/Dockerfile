# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first so the package layer is cached between code changes
COPY IIoT.sln ./
COPY src/IIoT.Api/IIoT.Api.csproj src/IIoT.Api/
COPY tests/IIoT.Tests/IIoT.Tests.csproj tests/IIoT.Tests/
RUN dotnet restore

COPY . .
RUN dotnet test --no-restore -c Release \
 && dotnet publish src/IIoT.Api/IIoT.Api.csproj --no-restore -c Release -o /app

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_HTTP_PORTS=5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "IIoT.Api.dll"]
