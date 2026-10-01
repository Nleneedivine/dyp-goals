import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    backgroundColor: "#F8FAF8",
    color: "#153A2B",
  },
  border: {
    flex: 1,
    borderWidth: 3,
    borderColor: "#1F6B4F",
    padding: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#4B6B5D",
    marginBottom: 18,
  },
  title: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 24,
  },
  presented: {
    fontSize: 13,
    color: "#5D7168",
    marginBottom: 10,
  },
  name: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    color: "#0C4D36",
    marginBottom: 20,
  },
  body: {
    maxWidth: 520,
    fontSize: 14,
    lineHeight: 1.6,
    textAlign: "center",
    color: "#354E43",
  },
  program: {
    marginTop: 8,
    fontFamily: "Helvetica-Bold",
    color: "#153A2B",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#6A7D74",
  },
});

export function ProgramCertificateDocument({
  participantName,
  programTitle,
  certificateCode,
  issuedAt,
}: {
  participantName: string;
  programTitle: string;
  certificateCode: string;
  issuedAt: string;
}) {
  return (
    <Document title={`${programTitle} - Certificate of Completion`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          <Text style={styles.eyebrow}>Discover Your Purpose</Text>
          <Text style={styles.title}>Certificate of Completion</Text>
          <Text style={styles.presented}>This certificate is presented to</Text>
          <Text style={styles.name}>{participantName}</Text>
          <Text style={styles.body}>
            for completing the program requirements for
          </Text>
          <Text style={[styles.body, styles.program]}>{programTitle}</Text>
          <Text style={[styles.body, { marginTop: 18 }]}>
            Issued {new Date(issuedAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>
        <View style={styles.footer}>
          <Text>Discover Your Purpose (DYP)</Text>
          <Text>Certificate ID: {certificateCode}</Text>
        </View>
      </Page>
    </Document>
  );
}
