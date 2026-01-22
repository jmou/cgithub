#!/usr/bin/env node
/**
 * GitHub Directory Listing Scraper
 *
 * Gets directory listings from GitHub without using the API (no rate limits!)
 * Works by parsing the server-rendered HTML that GitHub sends to browsers.
 */

async function getGitHubDirectory(owner, repo, path = '') {
  // Always use the tree URL pattern, even for root directory
  const url = `https://github.com/${owner}/${repo}/tree/main/${path}`;

  console.error(`Fetching: ${url}`);

  const response = await fetch(url);
  const html = await response.text();

  // GitHub embeds the directory data in a JSON script tag
  // Using the tree (subdirectory) pattern for all cases
  const subdirMatch = html.match(/<script type="application\/json" data-target="react-app\.embeddedData">([^<]+)<\/script>/);

  if (!subdirMatch) {
    throw new Error('Could not find embedded data in HTML');
  }

  const data = JSON.parse(subdirMatch[1]);
  const payload = data.payload;

  return {
    path: payload.path,
    branch: payload.refInfo.name,
    items: payload.tree.items,
    repo: {
      name: payload.repo.name,
      owner: payload.repo.ownerLogin,
      isPublic: payload.repo.public
    }
  };
}

// Example usage
if (require.main === module) {
  const [owner, repo, path] = process.argv.slice(2);

  if (!owner || !repo) {
    console.log('Usage: node github-scraper.js <owner> <repo> [path]');
    console.log('Example: node github-scraper.js torvalds linux');
    console.log('Example: node github-scraper.js torvalds linux Documentation');
    process.exit(1);
  }

  getGitHubDirectory(owner, repo, path)
    .then(result => {
      console.log('\n📂 Directory listing');
      console.log(`Repository: ${result.repo.owner}/${result.repo.name}`);
      console.log(`Branch: ${result.branch}`);
      console.log(`Path: ${result.path}`);
      console.log(`Items: ${result.items.length}`);
      console.log('\nContents:');

      result.items.forEach(item => {
        const icon = item.contentType === 'directory' ? '📁' : '📄';
        console.log(`  ${icon} ${item.name}`);
      });

      console.log('\n✓ No API rate limits - this scrapes the HTML!');
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = { getGitHubDirectory };
