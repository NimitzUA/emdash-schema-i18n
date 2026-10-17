import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@lingui/react";
import { setupI18n } from "@lingui/core";
import {
	useAdminLocale,
	useLocalizedText,
	LocalizedText,
} from "../src/admin/index.js";
import { installLocaleReloadWatcher } from "../src/localizer.mjs";

test("useAdminLocale, useLocalizedText, and LocalizedText render localized labels via Lingui context", () => {
	const i18n = setupI18n({
		locale: "uk-UA",
		messages: { "uk-UA": {} },
	});

	const dict = {
		uk: {
			"Case studies": "Кейси",
			"collections.posts.label": "Записи блогу",
		},
	};

	let capturedLocale = "";
	let capturedHookText = "";

	function ProbeComponent() {
		capturedLocale = useAdminLocale();
		capturedHookText = useLocalizedText("Case studies", { dictionary: dict });
		return React.createElement(
			LocalizedText,
			{
				dictionary: dict,
				translationKey: "collections.posts.label",
			},
			"Posts",
		);
	}

	const html = renderToStaticMarkup(
		React.createElement(
			I18nProvider,
			{ i18n },
			React.createElement(ProbeComponent),
		),
	);

	assert.equal(capturedLocale, "uk");
	assert.equal(capturedHookText, "Кейси");
	assert.equal(html, "Записи блогу");
});

test("useAdminLocale falls back to 'en' when rendered outside I18nProvider", () => {
	const html = renderToStaticMarkup(
		React.createElement(LocalizedText, null, "Кейси / Case studies"),
	);
	assert.equal(html, "Case studies");
});

test("installLocaleReloadWatcher registers MutationObserver and only reloads after initial lang is set", async () => {
	let observerCallback = null;
	let observedTarget = null;
	let observedOptions = null;
	let reloadCount = 0;
	let currentAttrLang = "";

	const prevWindow = globalThis.window;
	const prevDocument = globalThis.document;
	const prevMutationObserver = globalThis.MutationObserver;

	try {
		class MockMutationObserver {
			constructor(cb) {
				observerCallback = cb;
			}
			observe(target, options) {
				observedTarget = target;
				observedOptions = options;
			}
		}

		const mockDocElement = {
			getAttribute(name) {
				return name === "lang" ? currentAttrLang : null;
			},
		};

		globalThis.MutationObserver = MockMutationObserver;
		globalThis.document = { documentElement: mockDocElement };
		globalThis.window = {
			MutationObserver: MockMutationObserver,
			location: {
				reload() {
					reloadCount++;
				},
			},
		};

		installLocaleReloadWatcher();
		assert.equal(observedTarget, mockDocElement);
		assert.deepEqual(observedOptions, {
			attributes: true,
			attributeFilter: ["lang"],
		});

		// 1. Initial population from "" -> "en" must NOT trigger a reload
		currentAttrLang = "en";
		observerCallback();
		await new Promise((r) => setTimeout(r, 80));
		assert.equal(reloadCount, 0);

		// 2. Subsequent language switch "en" -> "uk" MUST trigger a reload
		currentAttrLang = "uk";
		observerCallback();
		await new Promise((r) => setTimeout(r, 80));
		assert.equal(reloadCount, 1);
	} finally {
		globalThis.window = prevWindow;
		globalThis.document = prevDocument;
		globalThis.MutationObserver = prevMutationObserver;
	}
});
