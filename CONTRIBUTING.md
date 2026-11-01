# Contributing

Thanks for helping improve Clive. Bug reports, feature ideas, documentation, and code contributions are welcome.

## Report a bug or suggest a feature

Open an [issue on GitHub](https://github.com/gi4nks/clive/issues). For a bug, include:

- Clive version and macOS version.
- A short description of what happened and what you expected.
- Steps to reproduce the issue.
- Relevant error messages, with private paths and personal data removed.

Do not attach API keys, private file contents, or unredacted screenshots.

## Set up a development build

Install Xcode Command Line Tools, Rust, and Node.js 20 or later, then follow the [README setup instructions](README.md#build-from-source). Wise is a Git submodule and is initialized by `make setup`.

## Make a change

- Keep pull requests focused and explain the user-visible behavior they change.
- Update the relevant OpenSpec contract when behavior changes.
- Add or update focused tests for code changes.
- Run the checks relevant to the files you changed. `make quality` runs the repository quality gate.
- Include screenshots for UI changes only when they use fictional data and contain no personal or confidential information.

Open a pull request against `main` and include a summary, rationale, linked issue when applicable, and the validation commands you ran.

## License

By contributing, you agree that your contributions are distributed under the project's [MIT License](LICENSE).
