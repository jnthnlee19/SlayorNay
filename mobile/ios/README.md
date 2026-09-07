# Gloss or Toss — iPhone preparation

This is the initial native iPhone shell. It loads the existing HTTPS Netlify site using a persistent WKWebView, with native Vote / Explore / My Votes navigation, sharing, external product links and connection recovery. Products and accounts remain in the existing Netlify database. No Apple membership is needed for the unsigned simulator build.

## Build
GitHub Actions → iPhone simulator build → Run workflow. The workflow installs XcodeGen on a hosted Mac and creates an unsigned simulator app artifact. This artifact cannot be installed on a physical iPhone. Apple enrollment, signing certificates and provisioning are required before TestFlight distribution. No signing secrets belong in this repository.

## Release work remaining
- Verify the simulator build and run device tests after enrollment (sign-in persistence, password recovery, voting changes, gestures, external shopping links and offline recovery).
- Add in-app account deletion and a public deletion request route, privacy policy and owner support contact.
- Finalize app icon assets, launch appearance, accessibility and store screenshots.
- Review App Store minimum-functionality requirements: this initial web-backed shell is not a claim of App Store readiness or guaranteed acceptance.
- Configure Apple signing and a separate manually triggered TestFlight release workflow after enrollment. Do not publish this unsigned artifact as an App Store build.

The bundle ID is provisional until registered in the owner's Apple account. Website design changes currently appear in the shell directly; future bundled UI changes would need a new app build. Android packaging is a separate next step.
