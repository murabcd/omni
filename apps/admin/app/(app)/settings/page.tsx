"use client";

import { Loader2 } from "lucide-react";
import { useGateway } from "@/components/gateway-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FieldProps {
	label: string;
	value: string;
	placeholder?: string;
	type?: string;
	onChange: (value: string) => void;
}

function Field({ label, value, placeholder, type, onChange }: FieldProps) {
	return (
		<div className="space-y-2">
			<Label className="text-sm text-[#606060]">{label}</Label>
			<Input
				value={value}
				placeholder={placeholder}
				type={type}
				onChange={(event) => onChange(event.target.value)}
				className="bg-transparent"
			/>
		</div>
	);
}

export default function SettingsPage() {
	const {
		baseUrl,
		token,
		setBaseUrl,
		setToken,
		connect,
		config,
		updateConfigField,
		saveConfig,
		configSaving,
		configError,
	} = useGateway();

	return (
		<div className="max-w-[900px] pt-6">
			<Tabs defaultValue="connection" className="w-full">
				<TabsList>
					<TabsTrigger value="connection">General</TabsTrigger>
					<TabsTrigger value="telegram">Telegram</TabsTrigger>
					<TabsTrigger value="cron">Cron</TabsTrigger>
					<TabsTrigger value="plugins">Plugins</TabsTrigger>
				</TabsList>

				{/* Connection Tab */}
				<TabsContent value="connection">
					<div className="space-y-8">
						<Card>
							<CardHeader>
								<CardTitle>Connection</CardTitle>
								<CardDescription>
									Configure the gateway URL and authentication token.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid gap-6 md:grid-cols-2">
									<Field
										label="Gateway URL"
										value={baseUrl}
										placeholder="http://127.0.0.1:8787"
										onChange={setBaseUrl}
									/>
									<Field
										label="Admin token"
										value={token}
										placeholder="Optional for local dev"
										type="password"
										onChange={setToken}
									/>
								</div>
							</CardContent>
							<CardFooter className="flex justify-between">
								<span>Connect to the gateway to load settings.</span>
								<Button onClick={connect}>Save</Button>
							</CardFooter>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Admin allowlist</CardTitle>
								<CardDescription>
									Restrict admin panel access to specific IP addresses.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="max-w-md">
									<Field
										label="Allowed IPs"
										value={config.ADMIN_ALLOWLIST ?? ""}
										placeholder="127.0.0.1"
										onChange={(value) =>
											updateConfigField("ADMIN_ALLOWLIST", value)
										}
									/>
								</div>
							</CardContent>
							<CardFooter>
								<span>Comma-separated IP addresses.</span>
							</CardFooter>
						</Card>
					</div>
				</TabsContent>

				{/* Telegram Tab */}
				<TabsContent value="telegram">
					<Card>
						<CardHeader>
							<CardTitle>Telegram</CardTitle>
							<CardDescription>
								Configure allowed users, groups, and message handling.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-6 md:grid-cols-2">
								<Field
									label="Allowed user IDs"
									value={config.ALLOWED_TG_IDS ?? ""}
									placeholder="123,456"
									onChange={(value) =>
										updateConfigField("ALLOWED_TG_IDS", value)
									}
								/>
								<Field
									label="Allowed group IDs"
									value={config.ALLOWED_TG_GROUPS ?? ""}
									placeholder="-100123"
									onChange={(value) =>
										updateConfigField("ALLOWED_TG_GROUPS", value)
									}
								/>
								<Field
									label="Require mention (1/0)"
									value={config.TELEGRAM_GROUP_REQUIRE_MENTION ?? ""}
									placeholder="1"
									onChange={(value) =>
										updateConfigField("TELEGRAM_GROUP_REQUIRE_MENTION", value)
									}
								/>
								<Field
									label="Timeout seconds"
									value={config.TELEGRAM_TIMEOUT_SECONDS ?? ""}
									placeholder="60"
									onChange={(value) =>
										updateConfigField("TELEGRAM_TIMEOUT_SECONDS", value)
									}
								/>
								<Field
									label="Text chunk limit"
									value={config.TELEGRAM_TEXT_CHUNK_LIMIT ?? ""}
									placeholder="4000"
									onChange={(value) =>
										updateConfigField("TELEGRAM_TEXT_CHUNK_LIMIT", value)
									}
								/>
							</div>
						</CardContent>
						<CardFooter>
							<span>Comma-separated IDs for multiple users or groups.</span>
						</CardFooter>
					</Card>
				</TabsContent>

				{/* Cron & Summary Tab */}
				<TabsContent value="cron">
					<Card>
						<CardHeader>
							<CardTitle>Cron & summary</CardTitle>
							<CardDescription>
								Configure scheduled reports and AI summarization.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-6 md:grid-cols-2">
								<Field
									label="Cron enabled (1/0)"
									value={config.CRON_STATUS_ENABLED ?? ""}
									placeholder="1"
									onChange={(value) =>
										updateConfigField("CRON_STATUS_ENABLED", value)
									}
								/>
								<Field
									label="Cron chat ID"
									value={config.CRON_STATUS_CHAT_ID ?? ""}
									placeholder="-100123"
									onChange={(value) =>
										updateConfigField("CRON_STATUS_CHAT_ID", value)
									}
								/>
								<Field
									label="Timezone"
									value={config.CRON_STATUS_TIMEZONE ?? ""}
									placeholder="Europe/Moscow"
									onChange={(value) =>
										updateConfigField("CRON_STATUS_TIMEZONE", value)
									}
								/>
								<Field
									label="Sprint filter"
									value={config.CRON_STATUS_SPRINT_FILTER ?? ""}
									placeholder="open"
									onChange={(value) =>
										updateConfigField("CRON_STATUS_SPRINT_FILTER", value)
									}
								/>
								<Field
									label="Max items per section"
									value={config.CRON_STATUS_MAX_ITEMS_PER_SECTION ?? ""}
									placeholder="0"
									onChange={(value) =>
										updateConfigField(
											"CRON_STATUS_MAX_ITEMS_PER_SECTION",
											value,
										)
									}
								/>
								<Field
									label="Summary enabled (1/0)"
									value={config.CRON_STATUS_SUMMARY_ENABLED ?? ""}
									placeholder="1"
									onChange={(value) =>
										updateConfigField("CRON_STATUS_SUMMARY_ENABLED", value)
									}
								/>
								<Field
									label="Summary model"
									value={config.CRON_STATUS_SUMMARY_MODEL ?? ""}
									placeholder="gpt-4o-mini"
									onChange={(value) =>
										updateConfigField("CRON_STATUS_SUMMARY_MODEL", value)
									}
								/>
							</div>
						</CardContent>
						<CardFooter>
							<span>Use 0 for max items to show all items.</span>
						</CardFooter>
					</Card>
				</TabsContent>

				{/* Plugins Tab */}
				<TabsContent value="plugins">
					<Card>
						<CardHeader>
							<CardTitle>Gateway plugins</CardTitle>
							<CardDescription>
								Configure which plugins are loaded and their access rules.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-6 md:grid-cols-2">
								<Field
									label="Plugins"
									value={config.GATEWAY_PLUGINS ?? ""}
									placeholder="logger"
									onChange={(value) =>
										updateConfigField("GATEWAY_PLUGINS", value)
									}
								/>
								<Field
									label="Allowlist"
									value={config.GATEWAY_PLUGINS_ALLOWLIST ?? ""}
									placeholder=""
									onChange={(value) =>
										updateConfigField("GATEWAY_PLUGINS_ALLOWLIST", value)
									}
								/>
								<Field
									label="Denylist"
									value={config.GATEWAY_PLUGINS_DENYLIST ?? ""}
									placeholder=""
									onChange={(value) =>
										updateConfigField("GATEWAY_PLUGINS_DENYLIST", value)
									}
								/>
							</div>
						</CardContent>
						<CardFooter>
							<span>Comma-separated plugin names.</span>
						</CardFooter>
					</Card>
				</TabsContent>
			</Tabs>

			{/* Save Button - Always visible */}
			<div className="mt-8 border-t border-border pt-6">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<p className="text-sm font-medium">Save all changes</p>
						<p className="text-xs text-[#606060]">
							Apply the configuration changes to the gateway.
						</p>
					</div>
					<Button onClick={saveConfig} disabled={configSaving}>
						{configSaving ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save"
						)}
					</Button>
				</div>
				{configError ? (
					<p className="mt-4 text-sm text-rose-500">{configError}</p>
				) : null}
			</div>
		</div>
	);
}
