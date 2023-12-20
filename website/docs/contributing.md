---
id: contributing
title: Contributing
---

## Questions

Please first read through the [FAQ](./faq). If that doesn't answer your question you can file an issue, see [issues](./#issues).

## Issues

If you have questions, bugs or feature requests, please file an issue. Before submitting an issue, please search the issue archive to help reduce duplicates, and read the [FAQ](../README.md#faq).
If you can't find it there you can submit an issue where you can submit:

-   🐛**Bug report**: Create a report to help us improve
-   📖**Documentation**: Suggest improvements or report missing/unclear documentation.
-   💡**Feature request**: Suggest an idea for this module.
-   💬**Question**: Ask questions.

# Contributing to Source Code (Pull Requests)

To create a PR for this project and start contributing follow this step-by-step guide:

-   Fork the project.
-   Clone the project somewhere on your computer

    ```sh
    git clone https://github.com/wswebcreation/wdio-image-comparison-service.git
    ```

-   Go to the directory and setup the project

    ```sh
    cd wdio-image-comparison-service
    npm install
    ```

-   Run the watch mode that will automatically transpile the code

    ```sh
    npm run watch
    ```

-   And create your new feature/fix a bug

## Tests

Several tests need to be executed to be able to test the module. When adding a PR all tests must at least pass the local tests.
Each PR is automatically tested against Sauce Labs, see [GitHub Actions with Sauce Labs](#github-actions-with-sauce-labs).
Before approving a PR the core contributors will test the PR against emulators/simulators/real devices.

### Local checks

First, a local baseline needs to be created. This can be done with

```sh
# With the webdriver protocol
npm run test.local.init

# With the Chrome DevTools protocol
npm run test.local.dev.tools.init
```

This command will create a folder called `localBaseline` that will hold all the baseline images.

Then run

```sh
# With the webdriver protocol
npm run test.local.desktop

# With the Chrome DevTools protocol
npm run test.local.dev.tools.desktop
```

This will run all tests on a local machine on Chrome.

### GitHub Actions with Sauce Labs

The command below is used to test the build on [GitHub Actions](https://github.com/wswebcreation/wdio-image-comparison-service/actions/workflows/wdio-image-comparison-service.yml), it can only be used there and not for local development.

```sh
npm run test.saucelabs
```

It will test against a lot of configurations and will be checked against Sauce Labs.

:::info
A PR from a forked repository can't automatically be tested with Sauce Labs due to security reasons. The contributors will check it manually.
:::
