"""SMS boundary: outbound OTP/reminders and, later, inbound agent status keywords.
The console adapter prints instead of sending; a real provider is added once one that reaches
Sierra Leone numbers is confirmed."""

from app.integrations.sms.base import ConsoleSmsGateway, SmsGateway

__all__ = ["SmsGateway", "ConsoleSmsGateway"]
