const fs = require("fs");
const https = require("https");

const repoOwner = "jharrels";
const repoName = "SAGE";
const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases`;

https.get(url, { headers: { "User-Agent": "Node.js" } }, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    const releases = JSON.parse(data);
    let changelog = "# Changelog\n\n";

    releases.forEach((release) => {
        const formattedDate = formatDate(release.published_at);
        changelog += `## ${release.tag_name} - ${formattedDate}\n${release.body}\n\n`;
    });

    fs.writeFileSync("CHANGELOG.md", changelog);
    console.log("Retrieved changelog");
  });
});

const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  };