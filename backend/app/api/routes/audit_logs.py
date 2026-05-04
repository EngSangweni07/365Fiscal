"""Audit log API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app.api.deps import (
    get_db, get_current_user, ensure_company_access,
    can_view_audit_logs, require_admin
)
from app.models.audit_log import AuditLog
from app.models.company_user import CompanyUser
from app.models.user import User
from app.schemas.audit_log import AuditLogRead, AuditLogSummary

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


def can_portal_super_view_audit_logs(db: Session, user: User, company_id: int) -> bool:
    link = db.query(CompanyUser).filter(
        CompanyUser.company_id == company_id,
        CompanyUser.user_id == user.id,
        CompanyUser.is_active == True,
    ).first()
    if not link:
        return False
    if link.is_company_admin:
        return True
    explicit_super = (
        db.query(CompanyUser)
        .filter(
            CompanyUser.company_id == company_id,
            CompanyUser.role == "portal",
            CompanyUser.is_active == True,
            CompanyUser.is_company_admin == True,
        )
        .first()
    )
    if explicit_super:
        return explicit_super.user_id == user.id
    return link.role == "portal"


@router.get("", response_model=List[AuditLogRead])
def list_audit_logs(
    company_id: Optional[int] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    response: Response = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    List audit logs with optional filters.
    - System admins can view all logs
    - Company admins can view logs for their company
    """
    # Build base query
    query = db.query(AuditLog)
    
    # Non-admins can only see logs for their companies
    if not user.is_admin:
        if company_id:
            ensure_company_access(db, user, company_id)
            if not can_view_audit_logs(db, user, company_id) and not can_portal_super_view_audit_logs(db, user, company_id):
                raise HTTPException(status_code=403, detail="Permission denied to view audit logs")
        else:
            # Get user's company IDs
            from app.models.company_user import CompanyUser
            links = db.query(CompanyUser).filter(
                CompanyUser.user_id == user.id,
                CompanyUser.is_active == True
            ).all()
            company_ids = [link.company_id for link in links]
            if not company_ids:
                if response is not None:
                    response.headers["X-Total-Count"] = "0"
                return []
            query = query.filter(AuditLog.company_id.in_(company_ids))
    
    # Apply filters
    if company_id:
        query = query.filter(AuditLog.company_id == company_id)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if resource_id:
        query = query.filter(AuditLog.resource_id == resource_id)
    if status:
        query = query.filter(AuditLog.status == status)
    if start_date:
        query = query.filter(AuditLog.action_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.action_at <= end_date)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (AuditLog.resource_reference.ilike(search_term)) |
            (AuditLog.user_email.ilike(search_term)) |
            (AuditLog.user.has(User.name.ilike(search_term))) |
            (AuditLog.changes_summary.ilike(search_term))
        )
    
    total_count = query.count()
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)

    # Order and paginate
    query = query.order_by(AuditLog.action_at.desc())
    query = query.offset(offset).limit(limit)
    
    return query.all()


@router.get("/summary", response_model=AuditLogSummary)
def get_audit_summary(
    company_id: Optional[int] = None,
    days: int = Query(7, le=90),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get audit log summary statistics."""
    from datetime import timedelta
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Build base query
    query = db.query(AuditLog).filter(AuditLog.action_at >= start_date)
    
    # Non-admins can only see logs for their companies
    if not user.is_admin:
        from app.models.company_user import CompanyUser
        links = db.query(CompanyUser).filter(
            CompanyUser.user_id == user.id,
            CompanyUser.is_active == True
        ).all()
        company_ids = [link.company_id for link in links]
        if not company_ids:
            return AuditLogSummary(
                total_actions=0,
                actions_by_type={},
                actions_by_user={},
                recent_errors=[]
            )
        query = query.filter(AuditLog.company_id.in_(company_ids))
    
    if company_id:
        if not user.is_admin:
            ensure_company_access(db, user, company_id)
            if not can_view_audit_logs(db, user, company_id) and not can_portal_super_view_audit_logs(db, user, company_id):
                raise HTTPException(status_code=403, detail="Permission denied to view audit logs")
        query = query.filter(AuditLog.company_id == company_id)
    
    # Total actions
    total_actions = query.count()
    
    # Actions by type
    type_counts = db.query(
        AuditLog.action, func.count(AuditLog.id)
    ).filter(AuditLog.action_at >= start_date)
    if company_id:
        type_counts = type_counts.filter(AuditLog.company_id == company_id)
    type_counts = type_counts.group_by(AuditLog.action).all()
    actions_by_type = {action: count for action, count in type_counts}
    
    # Actions by user
    user_counts = db.query(
        AuditLog.user_email, func.count(AuditLog.id)
    ).filter(AuditLog.action_at >= start_date)
    if company_id:
        user_counts = user_counts.filter(AuditLog.company_id == company_id)
    user_counts = user_counts.group_by(AuditLog.user_email).all()
    actions_by_user = {email or "system": count for email, count in user_counts}
    
    # Recent errors
    error_query = query.filter(AuditLog.status == "error")
    recent_errors = error_query.order_by(AuditLog.action_at.desc()).limit(10).all()
    
    return AuditLogSummary(
        total_actions=total_actions,
        actions_by_type=actions_by_type,
        actions_by_user=actions_by_user,
        recent_errors=recent_errors
    )


@router.get("/actions")
def list_action_types(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """List all distinct action types in the audit log."""
    results = db.query(AuditLog.action).distinct().all()
    return [r[0] for r in results if r[0]]


@router.get("/resource-types")
def list_resource_types(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """List all distinct resource types in the audit log."""
    results = db.query(AuditLog.resource_type).distinct().all()
    return [r[0] for r in results if r[0]]


@router.get("/{log_id}", response_model=AuditLogRead)
def get_audit_log(
    log_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get a specific audit log entry."""
    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # Check access
    if not user.is_admin and log.company_id:
        ensure_company_access(db, user, log.company_id)
        if not can_view_audit_logs(db, user, log.company_id) and not can_portal_super_view_audit_logs(db, user, log.company_id):
            raise HTTPException(status_code=403, detail="Permission denied")
    
    return log
