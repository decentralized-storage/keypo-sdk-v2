# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT License file
- .npmignore for optimized npm package distribution
- CHANGELOG.md for version history tracking

## [0.1.0] - 2024-10-16

### Added
- Initial release of Synapse Storage SDK for TypeScript
- **Core Features:**
  - 🔐 End-to-end encryption with Lit Protocol v8
  - 📁 Filecoin storage via Synapse network  
  - 🎫 NFT-based access control with smart contracts
  - 🌍 Public/private file modes with granular permissions
  - ⚡ Account abstraction via ZeroDev for gasless transactions

- **File Operations:**
  - `upload()` - Upload and encrypt files to Filecoin with progress tracking
  - `download()` - Download and decrypt files from Filecoin
  - `list()` - List all files owned by or shared with the current wallet
  - `listPublic()` - List all public files from all users on the network
  - `share()` - Share private files with other wallets by minting access NFTs
  - `delete()` - Delete files from permissions registry (revokes access)

- **Infrastructure:**
  - Smart contract integration for permission management
  - USDFC token balance management for storage payments
  - TypeScript support with full type definitions
  - ESM module format for modern JavaScript environments
  - Comprehensive error handling with categorized errors
  - Progress callbacks for long-running operations

- **Configuration:**
  - Support for Base Sepolia testnet and Filecoin Calibration network
  - Configurable storage capacity and persistence duration
  - Optional CDN acceleration for improved download speeds
  - Debug mode for troubleshooting

### Development History
- 2024-10-14: Initial implementation with upload/download functionality
- 2024-10-16: Added file listing, sharing, and deletion features
- 2024-10-16: Removed makePublic/makePrivate methods in favor of isPublic flag
- 2024-10-16: Comprehensive README documentation

[Unreleased]: https://github.com/decentralized-storage/filecoin-alphacohort-phase4/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/decentralized-storage/filecoin-alphacohort-phase4/releases/tag/v0.1.0