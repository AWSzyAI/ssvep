export class FrequencyManager {
  constructor(profile, groupKey = "recommended") {
    this.profile = profile;
    this.groupKey = groupKey;
  }

  setProfile(profile) {
    this.profile = profile;
  }

  setGroupKey(groupKey) {
    this.groupKey = groupKey;
  }

  getCurrentFrequencies() {
    const groups = this.profile.frequencyGroups || {};
    const values = groups[this.groupKey] || groups.recommended || [];

    return values.map((value, index) => ({
      slotId: index,
      frequencyHz: Number(value),
      label: `F${index + 1}: ${Number(value).toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")} Hz`,
      colorClass: `slot-${index + 1}`
    }));
  }
}
