# Releasing

Stable releases use semantic version tags such as `v1.0.0`. The release workflow validates the tag, runs the Bun test suite and a real `nginx-formatter` integration test, creates the GitHub Release, and moves the matching major tag such as `v1` to the released commit.

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

4. Wait for the **Release** workflow to finish. It creates the `v1.0.0` GitHub Release and updates `v1`, so workflows can use either reference:

   ```yaml
   - uses: soulteary/nginx-format-action@v1       # moving major release
   - uses: soulteary/nginx-format-action@v1.0.0   # fixed release
   ```

5. Check the generated release notes and verify the example workflow in a consumer repository.

The workflow stops before publishing when the pushed tag does not equal `v` plus the version in `package.json`. Re-running a successful release is safe: an existing GitHub Release is left unchanged, while the major tag is verified and updated again.

## Future releases

- Patch release: update `package.json` to `1.0.1`, merge the change, then push `v1.0.1`. The workflow moves `v1` to the new commit.
- Minor release: update `package.json` to `1.1.0`, merge the change, then push `v1.1.0`. The workflow still moves `v1`.
- Major release: update `package.json` to `2.0.0`, update documentation examples to `@v2`, then push `v2.0.0`. The workflow creates or moves `v2` without changing `v1`.

Do not move immutable full-version tags such as `v1.0.0`. Only major aliases such as `v1` are expected to move.
