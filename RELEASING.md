# Releasing

Stable releases use semantic version tags such as `v1.0.0`. The release workflow validates the tag, runs the Bun test suite and a real `nginx-formatter` integration test, creates the GitHub Release, and moves the matching major and minor tags such as `v1` and `v1.0` to the released commit.

[中文发布说明](RELEASING_CN.md)

## Publish v1.0.0

1. Confirm `package.json` contains `"version": "1.0.0"` and all release changes are on `main`.
2. Confirm the latest CI run on `main` is successful.
3. Create and push an annotated tag:

   ```bash
   git switch main
   git pull --ff-only
   git tag -a v1.0.0 -m "Nginx Format Action v1.0.0"
   git push origin v1.0.0
   ```

4. Wait for the **Release** workflow to finish. It creates the `v1.0.0` GitHub Release and updates `v1` and `v1.0`, so workflows can choose the appropriate reference:

   ```yaml
   - uses: soulteary/nginx-format-action@v1       # latest compatible v1 release
   - uses: soulteary/nginx-format-action@v1.0     # latest compatible v1.0 patch
   - uses: soulteary/nginx-format-action@v1.0.0   # exact release tag
   ```

5. Check the generated release notes and verify the example workflow in a consumer repository.

## GitHub Marketplace

Creating a GitHub Release does not complete the first Marketplace publication. For the first public listing, open the `v1.0.0` release on GitHub, edit it, select **Publish this Action to the GitHub Marketplace**, choose the appropriate categories, and publish the update. The repository owner may first need to accept the Marketplace Developer Agreement, and GitHub requires two-factor authentication for this operation.

This owner-confirmed Marketplace step is intentionally not automated by the release workflow. Later compatible releases continue using the same Action listing.

The workflow stops before publishing when the pushed tag does not equal `v` plus the version in `package.json`. Re-running a successful release is safe: an existing GitHub Release is left unchanged, while the major and minor tags are verified and updated again.

## Future releases

- Patch release: update `package.json` to `1.0.1`, merge the change, then push `v1.0.1`. The workflow moves `v1` and `v1.0` to the new commit.
- Minor release: update `package.json` to `1.1.0`, merge the change, then push `v1.1.0`. The workflow moves `v1` and creates or moves `v1.1`; `v1.0` remains unchanged.
- Major release: update `package.json` to `2.0.0`, update documentation examples to `@v2`, then push `v2.0.0`. The workflow creates or moves `v2` and `v2.0` without changing v1 tags.

Do not move full-version tags such as `v1.0.0`. Only major and minor aliases such as `v1` and `v1.0` are expected to move. For strict immutability, consumers should pin the Action to a full commit SHA.
