# Gloss or Toss — App Store preparation

Prepared September 12, 2026. This is a preparation package, not an Apple submission or a claim of approval.

## Listing copy

Name: Gloss or Toss
Subtitle: Nail products. Honest votes.
Suggested primary category: Lifestyle
Suggested secondary category: Shopping
Keywords: nails,nail tech,gel polish,manicure,beauty,product reviews,top coat,nail lamp,nail drill
Support URL: https://glossortoss.com/support.html
Privacy policy URL: https://glossortoss.com/privacy.html
Marketing URL: https://glossortoss.com/

Description:
Find your next nail staple—or dodge a disappointing restock.

Gloss or Toss is a community for honest opinions about nail products. Give products you have tried a Gloss or Toss, explore community verdicts, and save products to your Watchlist before you buy.

• Swipe through products or choose a category.
• Change your verdict when your experience changes—one saved vote per product.
• Explore recent activity, community favorites, divided opinions, and new additions.
• Keep track of your votes and Watchlist in your profile.
• Suggest products and contribute your own original photos for review.
• Share a product or your verdict with friends.

Free account required to vote, save products, or submit. Community submissions are reviewed before publication. Product scores come from community votes. Some purchase links may be affiliate links; commissions do not change voting results.

## Review notes draft

The app connects to the live Gloss or Toss service. Visitors may browse products. Email verification is required for voting, Watchlists, and submissions. Provide a verified, non-admin review account privately in App Store Connect before submission; do not commit its password to GitHub.

Account deletion: Profile → Account settings → Delete my account. Email confirmation is required. Deletion removes the user's votes, Watchlist, submissions and submitted photo files while preserving shared product listings and other users' data.

Content reports: open a product's Details → Report content. Submissions are moderated before publication. Administrators review reports and can hide products, replace photos, or suspend users. Public support contact is available in Profile and on the support page.

The app reviews nail products, not people. There are no direct messages or public user-to-user comments.

## Privacy disclosure worksheet — confirm in App Store Connect

Based on inspected code, disclose data linked to an account used for app functionality:
- Contact information: email address.
- Identifiers: account/user ID.
- User content: submitted photos, submission text, reports/support messages.
- Usage/product interaction: saved product votes and Watchlist activity.

Hosting/authentication also processes operational logs and network identifiers for security. Confirm Netlify's actual logging and retention configuration before final answers. Do not select “Data Not Collected.” No advertising ID or cross-app tracking SDK was found in the inspected native app; confirm this remains true in the final build. Affiliate destination sites have their own practices. Do not promise that third parties collect no data.

## Still requires owner participation

1. Apple Developer enrollment and acceptance of Apple's agreements.
2. Apple Team ID, signing/provisioning and an App Store Connect app record. The simulator ZIP is not an App Store upload.
3. A verified review account with credentials entered privately in App Store Connect.
4. Owner legal name/copyright, review contact phone/name, age-rating questionnaire, distribution countries and privacy disclosures.
5. TestFlight on a real iPhone: verification and reset emails, sign-in persistence, uploads, native Save Image/share menu, account deletion on a disposable account, and small-screen/keyboard behavior.
6. Review actual simulator screenshots before using them. Logged-out Profile/Submit previews may need replacement with signed-in screenshots from the final build. Do not use empty/loading/error screens as listing screenshots.
7. Explicit authorization to submit for Apple review. Nothing in this workflow uploads a build to Apple or submits for review.

## Build assets and validation

Inspected screenshot: `mobile/app-store/screenshots/01-the-vote.png` (1320 × 2868), captured from the running iPhone simulator against the live site. The full card and bottom navigation fit. Other initial captures show logged-out or empty states; one includes a system notification, so they are not included as listing assets.

The GitHub iPhone simulator workflow uses macOS 26/Xcode and produces an unsigned simulator app. Screenshot capture is an optional manual-workflow checkbox, with a twelve-minute limit. The first run completed successfully after a slow Apple simulator startup migration. Inspect the generated screenshots before using them in a listing; signed-in Profile and Submit screenshots should come from the final TestFlight build.

The app icon uses the existing Gloss or Toss logo on the Bubblegum background. Native image sharing is restricted to the app's HTTPS host and bounded PNG content. Native photo saving still requires real-device validation. Website regression tests passed (39 tests), plus one focused native-share bridge test. Live privacy/support pages and public voting were checked; reporting was exercised against an isolated database. No real accounts were deleted during testing.

Apple may request changes under minimum-functionality guideline 4.2 for a website-based app; native sharing and navigation do not guarantee approval.

References:
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/news/upcoming-requirements/?id=04282026a
