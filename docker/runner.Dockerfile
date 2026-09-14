# Code runner: ASP.NET Core API that compiles and runs C# (Roslyn, in-memory)
# and Rust (rustc). Run it only as configured in docker-compose.yml: no network
# egress, read-only root, dropped capabilities, memory/pid/CPU limits.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY runner/Unmanaged.Runner.csproj runner/
RUN dotnet restore runner/Unmanaged.Runner.csproj
COPY runner/ runner/
RUN dotnet publish runner/Unmanaged.Runner.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0

# Pinned to the toolchain the site's content was verified against (src/content/meta.ts).
ARG RUST_VERSION=1.97.1
ENV RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH=/opt/cargo/bin:$PATH

# rustc needs a C linker (cc) and libc headers to link binaries.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gcc libc6-dev \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain "${RUST_VERSION}" --no-modify-path \
 && chmod -R a+rX /opt/rustup /opt/cargo \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app .

ENV Urls=http://+:8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    TMPDIR=/tmp

# Non-root user shipped with the .NET images.
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Unmanaged.Runner.dll"]
