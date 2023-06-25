import {app} from "/scripts/app.js";
import {$el} from "/scripts/ui.js";

const id = "Comfy.i18n";
let selectedLocale;

const ext = {
	name: id,
	async setup(comfyApp) {
		const res = await fetch("/locales");
		const locales = await res.json();

		const storedLocale = comfyApp.ui.settings.getSettingValue(id, undefined);
		if (storedLocale === undefined) {
			await comfyApp.ui.setLocale(navigator.language.split("-")[0]);
		} else {
			await comfyApp.ui.setLocale(storedLocale);
		}

		comfyApp.ui.settings.addSetting({
			id,
			name: "Language",
			defaultValue: selectedLocale,
			type: (name, setter, value) => {
				const options = Object.values(locales).map(o => $el("option", {
					textContent: o,
					value: o,
					selected: o === value
				}));

				const translation = comfyApp.ui.translations.extensions.core.i18n.label;

				return $el("tr", [
					$el("td", [
						$el("label", {
							for: id.replaceAll(".", "-"),
							"data-i18n-key": "extensions.core.i18n.label",
							textContent: translation ? translation : "Language",
						}),
					]),
					$el("td", [
						$el("select", {
							style: {
								width: "100%",
							},
							onchange: (e) => {
								setter(e.target.value);
								comfyApp.ui.setLocale(e.target.value);
							}
						}, options)
					]),
				])
			},
			async onChange(value) {
				if (!value) {
					return;
				}

				comfyApp.ui.setLocale(value).then();
			},
		});
	},
}

app.registerExtension(ext);