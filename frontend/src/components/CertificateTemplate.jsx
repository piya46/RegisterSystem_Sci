import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";

// Register Thai fonts
Font.register({
  family: "NotoSansThai",
  fonts: [
    { src: `${window.location.origin}/fonts/NotoSansThai-Regular.ttf` },
    { src: `${window.location.origin}/fonts/NotoSansThai-Bold.ttf`, fontWeight: "bold" },
  ],
});

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "NotoSansThai",
    position: "relative",
  },
  border: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    border: "2px solid #FFC107",
    padding: 10,
  },
  innerBorder: {
    flex: 1,
    border: "1px solid #FFC107",
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#263238",
    marginBottom: 20,
  },
  subHeaderText: {
    fontSize: 16,
    color: "#455a64",
    marginBottom: 40,
  },
  nameText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#d32f2f",
    marginBottom: 40,
    textAlign: "center",
  },
  bodyText: {
    fontSize: 16,
    color: "#455a64",
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  signatureBlock: {
    alignItems: "center",
    width: 200,
  },
  signatureLine: {
    width: "100%",
    borderBottom: "1px solid #000",
    marginBottom: 10,
  },
  signatureText: {
    fontSize: 14,
  },
  qrCodeBlock: {
    alignItems: "center",
  },
  qrCodeImage: {
    width: 80,
    height: 80,
    marginBottom: 5,
  },
  qrCodeText: {
    fontSize: 10,
    color: "#607d8b",
  },
});

const CertificateTemplate = ({
  participantName,
  eventName,
  eventDate,
  qrCodeDataUri,
  verificationId,
  backgroundImageUrl
}) => {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {backgroundImageUrl && (
          <Image src={backgroundImageUrl} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} />
        )}
        <View style={backgroundImageUrl ? { flex: 1, padding: 40, alignItems: "center", justifyContent: "center", position: "relative" } : styles.border}>
          <View style={backgroundImageUrl ? { width: "100%", alignItems: "center" } : styles.innerBorder}>
            <Text style={styles.headerText}>เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า</Text>

            <Text style={styles.nameText}>{participantName}</Text>

            <Text style={styles.bodyText}>
              ได้เข้าร่วมกิจกรรม {eventName} อย่างสมบูรณ์{"\n"}
              ขอให้มีความสุขความเจริญ และประสบความสำเร็จในสิ่งที่มุ่งหวังทุกประการ
            </Text>

            <Text style={styles.subHeaderText}>ให้ไว้ ณ วันที่ {eventDate}</Text>

            <View style={styles.footer}>
              <View style={styles.signatureBlock}>
                <View style={styles.signatureLine}></View>
                <Text style={styles.signatureText}>คณะผู้จัดงาน</Text>
                <Text style={styles.signatureText}>{eventName}</Text>
              </View>

              {qrCodeDataUri && (
                <View style={styles.qrCodeBlock}>
                  <Image src={qrCodeDataUri} style={styles.qrCodeImage} />
                  <Text style={styles.qrCodeText}>Scan to Verify</Text>
                  <Text style={styles.qrCodeText}>{verificationId}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default CertificateTemplate;
