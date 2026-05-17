export enum WarningCode {
  UnknownKey = 'unknown_key',
  LockedSettingOverrideIgnored = 'locked_setting_override_ignored',
  PrototypePollutionAttempt = 'prototype_pollution_attempt',
  SvgOnlyOptionInPng = 'svg_only_option_in_png',
  ThemeCssRejected = 'theme_css_rejected',
  ScaleIgnoredForSvg = 'scale_ignored_for_svg'
}

export interface Warning {
  code: WarningCode
  detail: Record<string, unknown>
}

export class WarningCollector {
  private readonly warnings: Warning[] = []

  add(code: WarningCode, detail: Record<string, unknown> = {}): void {
    this.warnings.push({ code, detail })
  }

  drain(): Warning[] {
    return this.warnings.splice(0)
  }
}
