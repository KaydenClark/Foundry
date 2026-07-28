# Foundry Reference

`foundry-schematic-FND-01.html` is the portable conceptual map for a Servitor
Foundry. It describes ownership and installation boundaries, not a live
deployment inventory or health report.

The diagram deliberately uses relative locations and generic instance data.
The Forge, the Assay, and the Ward are the Foundry's native Halls — tracked
source inside this repository, not installed. Modules (OpenBrain, CIC, Slack,
Discord) remain independent Git repositories, installed by the manifest, and
are never vendored into the Foundry harness.
