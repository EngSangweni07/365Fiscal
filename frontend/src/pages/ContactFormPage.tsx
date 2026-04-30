import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { useCompanies, Company } from "../hooks/useCompanies";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import BackButton from "../components/BackButton";
import {
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";

type Contact = {
  id: number;
  company_id: number;
  name: string;
  address: string;
  vat: string;
  tin: string;
  phone: string;
  email?: string;
  reference?: string;
};

type RouteParams = {
  contactId?: string;
};

const emptyForm = {
  name: "",
  address: "",
  vat: "",
  tin: "",
  phone: "",
  email: "",
  reference: ""
};

export default function ContactFormPage() {
  const { contactId } = useParams<RouteParams>();
  const navigate = useNavigate();
  const { companies, loading: companiesLoading } = useCompanies();
  const isNew = !contactId;
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [isCompany, setIsCompany] = useState<boolean>(true);
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companies.length && companyId === null) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const applyContact = (contact: Contact) => {
    setSelectedContactId(contact.id);
    setCompanyId(contact.company_id);
    setForm({
      name: contact.name,
      address: contact.address || "",
      vat: contact.vat || "",
      tin: contact.tin || "",
      phone: contact.phone || "",
      email: contact.email || "",
      reference: contact.reference || ""
    });
    setStreet(contact.address || "");
    setStreet2("");
    setCity("");
    setZip("");
    setCountry("");
    setTags((contact.reference || "").split(",").map((t) => t.trim()).filter(Boolean));
    setIsEditing(true);
    setInvalidFields([]);
  };

  useEffect(() => {
    if (isNew || !companies.length) return;
    const id = Number(contactId);
    if (!id) return;

    const loadContact = async () => {
      setNotFound(false);
      for (const company of companies) {
        const data = await apiFetch<Contact[]>(`/contacts?company_id=${company.id}`);
        const found = data.find((c) => c.id === id);
        if (found) {
          applyContact(found);
          return;
        }
      }
      setNotFound(true);
    };

    loadContact();
  }, [contactId, companies, isNew]);

  const composeAddress = () => {
    return [street, street2, [city, zip].filter(Boolean).join(" "), country]
      .filter((s) => s && s.trim().length)
      .join("\n");
  };

  const clearInvalidField = (key: string, value: unknown) => {
    if (!invalidFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidFields((prev) => prev.filter((field) => field !== key));
  };

  const validateContactRequiredFields = (): boolean => {
    const requiredFields = [{ key: "name", label: "Name", value: form.name }];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidFields(missingFields.map((field) => field.key));
      return false;
    }
    setInvalidFields([]);
    setError(null);
    return true;
  };

  const handleNameInput = (value: string) => {
    setForm((prev) => ({ ...prev, name: value }));
    clearInvalidField("name", value);
  };

  const createContact = async () => {
    if (!companyId) {
      setError("Please select a company first.");
      return;
    }
    if (!validateContactRequiredFields()) return;
    const created = await apiFetch<Contact>("/contacts", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        company_id: companyId,
        address: composeAddress(),
        reference: tags.join(", ")
      })
    });
    setSelectedContactId(created.id);
    setIsEditing(false);
    navigate(`/contacts/${created.id}`);
  };

  const updateContact = async () => {
    if (!selectedContactId) return;
    if (!companyId) {
      setError("Please select a company first.");
      return;
    }
    if (!validateContactRequiredFields()) return;
    await apiFetch<Contact>(`/contacts/${selectedContactId}`, {
      method: "PUT",
      body: JSON.stringify({
        ...form,
        address: composeAddress(),
        reference: tags.join(", ")
      })
    });
    setIsEditing(false);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setStreet("");
    setStreet2("");
    setCity("");
    setZip("");
    setCountry("");
    setTags([]);
    setInvalidFields([]);
  };

  useEffect(() => {
    if (isNew) {
      setSelectedContactId(null);
      resetForm();
      setIsEditing(true);
    }
  }, [isNew]);

  if (companiesLoading && companyId === null) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (companyId === null && companies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  if (notFound) {
    return (
      <div className="content">
        <div className="form-shell invoice-form">
          <div className="form-header">
            <div>
              <h3>Customer</h3>
            </div>
            <div className="form-actions">
              <BackButton
                className="outline"
                fallbackTo="/contacts"
                showIcon={false}
                title="Back"
                ariaLabel="Back"
              >
                Back
              </BackButton>
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            Customer not found.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="form-view">
        <div className="form-shell invoice-form">
          <div className="form-header">
            <div>
              <h3>Customer</h3>
              <div className="statusbar">
                <span className={`status-pill ${selectedContactId ? "" : "active"}`}>New</span>
                <span className={`status-pill ${selectedContactId ? "active" : ""}`}>Saved</span>
              </div>
            </div>
            <div className="form-actions">
              <BackButton
                className="outline"
                fallbackTo="/contacts"
                showIcon={false}
                title="Back"
                ariaLabel="Back"
              >
                Back
              </BackButton>
              {isEditing ? (
                <>
                  <button className="primary" onClick={selectedContactId ? updateContact : createContact}>Save</button>
                  <button className="outline" onClick={() => setIsEditing(false)}>Discard</button>
                </>
              ) : (
                <button className="primary" onClick={() => setIsEditing(true)}>Edit</button>
              )}
            </div>
          </div>

          <ValidationAlert message={error} onClose={() => setError(null)} />

          <div className="form-grid">
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="settings-card-title" style={{ marginBottom: 8 }}>Contact Information</div>
              <div className="form-grid">
                <label className="input">
                  Company / Individual
                  <select className="input-underline" value={isCompany ? "company" : "individual"} onChange={(e) => setIsCompany(e.target.value === "company")} disabled={!isEditing}>
                    <option value="company">Company</option>
                    <option value="individual">Individual</option>
                  </select>
                </label>
              <div className="input-group">
                <ValidatedField
                  label="Display Name"
                  className="input"
                  isInvalid={invalidFields.includes("name")}
                >
                  <input
                    className="input-underline"
                    type="text"
                    value={form.name}
                    onChange={(e) => handleNameInput(e.target.value)}
                    disabled={!isEditing}
                  />
                </ValidatedField>
              </div>
                <label className="input">
                  Phone
                  <input className="input-underline" type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!isEditing} />
                </label>
                <label className="input">
                  Email
                  <input className="input-underline" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!isEditing} />
                </label>
              </div>
            </div>

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="settings-card-title" style={{ marginBottom: 8 }}>Addresses</div>
              <div className="form-grid">
                <label className="input">
                  Street
                  <input className="input-underline" type="text" value={street} onChange={(e) => setStreet(e.target.value)} disabled={!isEditing} />
                </label>
                <label className="input">
                  Street 2
                  <input className="input-underline" type="text" value={street2} onChange={(e) => setStreet2(e.target.value)} disabled={!isEditing} />
                </label>
                <label className="input">
                  City
                  <input className="input-underline" type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={!isEditing} />
                </label>
                <label className="input">
                  ZIP
                  <input className="input-underline" type="text" value={zip} onChange={(e) => setZip(e.target.value)} disabled={!isEditing} />
                </label>
                <label className="input">
                  Country
                  <input className="input-underline" type="text" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!isEditing} />
                </label>
              </div>
            </div>

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="settings-card-title" style={{ marginBottom: 8 }}>Tax & Tags</div>
              <div className="form-grid">
                <label className="input">
                  VAT
                  <input className="input-underline" type="text" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} disabled={!isEditing} />
                </label>
                <label className="input">
                  TIN
                  <input className="input-underline" type="text" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} disabled={!isEditing} />
                </label>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Tags</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {tags.map((t, i) => (
                      <span key={i} className="status-pill active" style={{ cursor: "pointer" }} onClick={() => setTags(tags.filter((_t, idx) => idx !== i))}>{t} ×</span>
                    ))}
                    {isEditing && (
                      <input
                        type="text"
                        placeholder="Add tag"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                            setTags([...tags, (e.target as HTMLInputElement).value.trim()]);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }}
                        style={{ padding: "6px 10px", border: "1px solid var(--stroke)", borderRadius: 8 }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <label className="input" style={{ gridColumn: "1 / -1" }}>
              Company
              <select className="input-underline" value={companyId ?? ""} onChange={(e) => setCompanyId(Number(e.target.value))} disabled={!isEditing}>
                {companies.map((c: Company) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
