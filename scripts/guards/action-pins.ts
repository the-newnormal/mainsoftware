// The actions deploy.yml uses, each at one commit (C11-D48, C11-D79, DPW-04; TECH-SPEC T24 item 28). A
// commit pushed only to a fork of an action resolves under the action's own name, since forks share objects
// with it, and an older release's commit can stand under a newer version's comment, so a 40-hex pin with a
// version comment proves nothing on its own. DPW-04 holds every uses: in deploy.yml to its action's entry
// here, so a pin moves only with this file, and CI proves each entry against the action's own repository
// (scripts/check-action-pins.ts, in ci.yml's job action-pins, which check needs): the version's tag there
// must name exactly that commit. A tag the action moves or deletes fails that check until a person reads
// the change and moves the pin here and in deploy.yml together, and a Renovate digest bump of deploy.yml
// fails DPW-04 until the same PR moves the entry here. The deploy-workflow guard reads its rules from this
// file, so it is on the owner's-read list with it (C11-D74).
export const ACTION_PINS: Readonly<Record<string, string>> = {
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'actions/setup-node': '949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
  'actions/upload-artifact': 'cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
  'actions/download-artifact': '9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2',
  'aws-actions/configure-aws-credentials': 'e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0',
}

// An entry's commit and version: a 40-hex commit, then its version in a comment.
export const PIN_SHAPE = /^([0-9a-f]{40}) # (v\d+\.\d+\.\d+)$/
// An action's name: an owner and a repository, each of GitHub's own name characters.
export const ACTION_SHAPE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/
