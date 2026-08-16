# Use a stable Ubuntu base
FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install core build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    autoconf \
    libtool \
    bison \
    flex \
    texinfo \
    git \
    pkg-config \
    python3-dev \
    swig \
    && rm -rf /var/lib/apt/lists/*

# Clone the LibreDWG repository
WORKDIR /src
RUN git clone --depth 1 https://github.com/LibreDWG/libredwg.git .

# Build and install LibreDWG
RUN ./autogen.sh \
    && ./configure --prefix=/usr/local \
    && make \
    && make check \
    && make install \
    && ldconfig

# Set a working directory for your CAD files
WORKDIR /workspace

# Default command to verify installation
CMD ["dwgread", "--version"]
