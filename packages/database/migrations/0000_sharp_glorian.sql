CREATE TABLE "account_passwords" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_normalized" varchar(254) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_verified_at" timestamp with time zone,
	CONSTRAINT "accounts_email_normalized_key" UNIQUE("email_normalized"),
	CONSTRAINT "accounts_email_canonical_check" CHECK (length("accounts"."email_normalized") > 0 AND "accounts"."email_normalized" = lower("accounts"."email_normalized") AND octet_length("accounts"."email_normalized") = length("accounts"."email_normalized"))
);
--> statement-breakpoint
ALTER TABLE "account_passwords" ADD CONSTRAINT "account_passwords_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;