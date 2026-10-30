# Spec Delta

## ADDED Requirements

### Requirement: Reproducible source formatting

The repository SHALL provide a pinned formatter, committed style configuration, and write/check commands for maintained frontend and backend sources. Formatting MUST preserve migration SQL, generated migration metadata, checksum-sensitive assets, dependency lockfiles, generated outputs, and historical workflow records.

#### Scenario: Contributor formats source

- **WHEN** the documented formatter runs
- **THEN** supported maintained source files use the same readable style and LF line endings
- **AND** protected history and checksum-sensitive files retain their bytes

#### Scenario: Formatting is checked

- **WHEN** source formatting differs from the committed configuration
- **THEN** the check command fails without writing files
