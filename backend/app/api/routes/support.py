from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import require_portal_user
from app.services.email import send_support_request_email


router = APIRouter(prefix="/support", tags=["support"])

SUPPORT_EMAIL = "courageg@geenet.co.zw"
SUPPORT_CC_EMAILS = ["support@geenet.co.zw", "info@geenet.co.zw"]


class SupportRequestPayload(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone_number: str = Field(default="", max_length=50)
    company_name: str = Field(default="", max_length=255)
    subject: str = Field(min_length=3, max_length=255)
    message: str = Field(min_length=10, max_length=4000)
    current_path: str = Field(default="", max_length=1000)


@router.post("/request")
def send_support_request(
    payload: SupportRequestPayload,
    user=Depends(require_portal_user),
):
    try:
        send_support_request_email(
            to_email=SUPPORT_EMAIL,
            requester_name=payload.name,
            requester_email=payload.email,
            requester_phone=payload.phone_number,
            company_name=payload.company_name,
            subject=payload.subject,
            message=payload.message,
            current_path=payload.current_path,
            signed_in_email=user.email,
            cc_emails=SUPPORT_CC_EMAILS,
        )
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Support email could not be sent: {exc}",
        ) from exc

    return {"status": "sent"}
